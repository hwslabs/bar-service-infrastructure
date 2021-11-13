import {WebService} from './webService';
import {CfnOutput, Construct, SecretValue, Stack} from "@aws-cdk/core";
import {IBaseService} from "@aws-cdk/aws-ecs";
import {Repository} from "@aws-cdk/aws-ecr";
import {Artifact, Pipeline as CodePipeline} from "@aws-cdk/aws-codepipeline";
import {StringParameter} from "@aws-cdk/aws-ssm";
import {
    CodeBuildAction,
    EcsDeployAction,
    GitHubSourceAction,
    ManualApprovalAction
} from "@aws-cdk/aws-codepipeline-actions";
import {BuildEnvironmentVariableType, BuildSpec, LinuxBuildImage, PipelineProject} from "@aws-cdk/aws-codebuild";

interface WebServicePipelineProps {
    readonly webService: WebService;
}

class WebServicePipeline extends Construct {
    private readonly webService: WebService;

    readonly service: IBaseService;
    readonly containerName: string;
    readonly ecrRepo: Repository;
    readonly token = SecretValue.secretsManager('/code-pipeline/builder/github/oauth-token');
    readonly owner = StringParameter.valueForStringParameter(this, '/code-pipeline/builder/github/user');
    readonly repo = StringParameter.valueForStringParameter(this, '/code-pipeline/sources/github/repo');
    readonly branch = StringParameter.valueForStringParameter(this, '/code-pipeline/sources/github/branch');
    readonly email = StringParameter.valueForStringParameter(this, '/code-pipeline/notifications/email/primary-email');

    public readonly pipeline: CodePipeline;

    constructor(scope: Construct, id: string, props: WebServicePipelineProps) {
        super(scope, id);
        this.webService = props.webService;
        this.service = this.webService.service;
        this.ecrRepo = this.webService.ecrRepo;
        this.containerName = this.webService.containerName;

        this.pipeline = this.createPipeline();
        this.output();
    }

    private createPipeline(): CodePipeline {
        const sourceOutput = new Artifact();
        const buildOutput = new Artifact();

        // Create project and grant it pull push permissions to ECR
        const project = this.createProject()
        this.ecrRepo.grantPullPush(project.grantPrincipal);

        const gitHubSourceAction = new GitHubSourceAction({
            actionName: 'Github_Source',
            owner: this.owner,
            repo: this.repo,
            branch: this.branch,
            oauthToken: this.token,
            output: sourceOutput
        });

        const codebuildAction = new CodeBuildAction({
            actionName: 'CodeBuild_Action',
            input: sourceOutput,
            outputs: [buildOutput],
            project: project,
            environmentVariables: {
                COMMIT_ID: {value: gitHubSourceAction.variables.commitId}
            }
        });

        const manualApproval = new ManualApprovalAction({
            actionName: 'DeploymentApproval',
            notifyEmails: [this.email],
            runOrder: 1
        });
        const ecsDeployAction = new EcsDeployAction({
            actionName: 'ECSDeploy_Action',
            input: buildOutput,
            service: this.service,
            runOrder: 2
        });

        return new CodePipeline(this, 'Pipeline', {
            stages: [
                {
                    stageName: 'Source',
                    actions: [gitHubSourceAction],
                },
                {
                    stageName: 'Build',
                    actions: [codebuildAction],
                },
                {
                    stageName: 'Deploy',
                    actions: [manualApproval, ecsDeployAction],
                }
            ]
        });
    }

    private createProject(): PipelineProject {
        return new PipelineProject(
            this,
            'Project',
            {
                buildSpec: this.createBuildSpec(),
                environment: {
                    buildImage: LinuxBuildImage.STANDARD_5_0,
                    privileged: true,
                    environmentVariables: {
                        GITHUB_URL: {
                            //TODO: Fix this
                            value: 'git@github.com:hwslabs/bar-service-kotlin-server.git'
                        },
                        GITHUB_SSH_PRIVATE_KEY: {
                            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
                            value: '/code-pipeline/builder/github/ssh-private-key'
                        },
                        GITHUB_SSH_PUBLIC_KEY: {
                            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
                            value: '/code-pipeline/builder/github/ssh-public-key'
                        },
                        AWS_ACCOUNT_ID: {
                            value: Stack.of(this).account
                        },
                        AWS_REGION: {
                            value: Stack.of(this).region
                        },
                        REPOSITORY_URI: {
                            value: this.ecrRepo.repositoryUri
                        },
                        CONTAINER_NAME: {
                            value: this.containerName
                        }
                    }
                }
            }
        );
    }

    createBuildSpec(): BuildSpec {
        return BuildSpec.fromObject({
            version: '0.2',
            phases: {
                install: {
                    commands: [
                        'echo Setting up sources and syncing git submodules...',
                        'mkdir -p ~/.ssh',
                        'echo "$GITHUB_SSH_PRIVATE_KEY" | base64 --decode > ~/.ssh/id_rsa',
                        'echo "$GITHUB_SSH_PUBLIC_KEY" > ~/.ssh/id_rsa.pub',
                        'chmod 600 ~/.ssh/id_rsa',
                        'eval "$(ssh-agent -s)"',
                        'git init',
                        'git remote add origin "$GITHUB_URL"',
                        'git fetch origin',
                        'git branch',
                        'git checkout -f "$CODEBUILD_RESOLVED_SOURCE_VERSION"',
                        'git submodule init',
                        'git submodule update --recursive'
                    ]
                },
                pre_build: {
                    commands: [
                        'echo Logging in to Amazon ECR...',
                        'aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com',
                        'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
                        'IMAGE_TAG=${COMMIT_HASH:=latest}',
                        'echo Ready to build on commit=$COMMIT_HASH with image=$IMAGE_TAG...'
                    ]
                },
                build: {
                    commands: [
                        'echo Build started on `date`',
                        'echo Building the Docker image...',
                        'docker build -t $REPOSITORY_URI:latest .',
                        'docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG',
                    ]
                },
                post_build: {
                    commands: [
                        'echo Build completed on `date`',
                        'echo Pushing the Docker image to ${REPOSITORY_URI}:latest and tag ${REPOSITORY_URI}:${IMAGE_TAG}...',
                        'docker push $REPOSITORY_URI:latest',
                        'docker push $REPOSITORY_URI:$IMAGE_TAG',
                        'printf "[{\\"name\\":\\"${CONTAINER_NAME}\\",\\"imageUri\\":\\"${REPOSITORY_URI}:latest\\"}]" > imagedefinitions.json'
                    ]
                }
            },
            artifacts: {
                files: [
                    'imagedefinitions.json'
                ]
            }
        });
    }

    output() {
        new CfnOutput(this, 'Pipeline ARN', {value: this.pipeline.pipelineArn})
    }
}

export {WebServicePipeline, WebServicePipelineProps};