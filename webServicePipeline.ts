import {WebService} from './webService';
import {CfnOutput, Construct, Stack} from "@aws-cdk/core";
import {IBaseService} from "@aws-cdk/aws-ecs";
import {Repository} from "@aws-cdk/aws-ecr";
import {Artifact, Pipeline as CodePipeline} from "@aws-cdk/aws-codepipeline";
import {StringParameter} from "@aws-cdk/aws-ssm";
import {
    CodeBuildAction,
    CodeStarConnectionsSourceAction,
    EcsDeployAction,
    ManualApprovalAction
} from "@aws-cdk/aws-codepipeline-actions";
import {
    BuildSpec, EventAction, FilterGroup,
    LinuxBuildImage, Project,
    Source
} from "@aws-cdk/aws-codebuild";
import {CfnConnection} from "@aws-cdk/aws-codestarconnections";
import {Effect, PolicyStatement} from "@aws-cdk/aws-iam";
import {SlackChannelConfiguration} from "@aws-cdk/aws-chatbot";
import {Topic} from "@aws-cdk/aws-sns";

interface WebServicePipelineProps {
    readonly webService: WebService;
}

class WebServicePipeline extends Construct {
    private readonly webService: WebService;

    readonly service: IBaseService;
    readonly containerName: string;
    readonly ecrRepo: Repository;
    readonly codeStarConnection: CfnConnection;
    readonly useConnectionPolicy: PolicyStatement;

    readonly owner = StringParameter.valueForStringParameter(this, '/code-pipeline/builder/github/user');
    readonly repo = StringParameter.valueForStringParameter(this, '/code-pipeline/sources/github/repo');
    readonly branch = StringParameter.valueForStringParameter(this, '/code-pipeline/sources/github/branch');
    readonly email = StringParameter.valueForStringParameter(this, '/code-pipeline/notifications/email/primary-email');
    readonly slackWorkspaceId = StringParameter.valueForStringParameter(this, '/code-pipeline/notifications/slack/workspace-id');
    readonly slackChannelId = StringParameter.valueForStringParameter(this, '/code-pipeline/notifications/slack/channel-id');

    public readonly pipeline: CodePipeline;

    constructor(scope: Construct, id: string, props: WebServicePipelineProps) {
        super(scope, id);
        this.webService = props.webService;
        this.service = this.webService.service;
        this.ecrRepo = this.webService.ecrRepo;
        this.containerName = this.webService.containerName;
        this.codeStarConnection = this.createCodeStarConnection();
        this.useConnectionPolicy = this.createConnectionPolicy();

        this.pipeline = this.createPipeline();
        this.output();
    }

    private createCodeStarConnection() : CfnConnection {
        return new CfnConnection(this, 'GitHubConnection', {
            connectionName: "GitHubConnection",
            providerType: "GitHub"
        });
    }

    private createConnectionPolicy(): PolicyStatement {
        return new PolicyStatement( {
            actions: [ 'codestar-connections:UseConnection' ],
            effect: Effect.ALLOW,
            resources: [ this.codeStarConnection.attrConnectionArn ]
        })
    }

    private createPipeline(): CodePipeline {
        const sourceOutput = new Artifact();
        const buildOutput = new Artifact();

        // Create project and grant it pull push permissions to ECR
        const project = this.createProject()
        this.ecrRepo.grantPullPush(project.grantPrincipal);

        const manualApprovalTopic = new Topic(this, 'ManualApprovalTopic', {
            displayName: 'CodePipelineManualApprovalTopic'
        })

        const codeStarConnectionSourceAction = new CodeStarConnectionsSourceAction({
            actionName: "Source",
            owner: this.owner,
            repo: this.repo,
            branch: this.branch,
            connectionArn: this.codeStarConnection.attrConnectionArn,
            codeBuildCloneOutput: true,
            output: sourceOutput,
        });

        const codebuildAction = new CodeBuildAction({
            actionName: 'Build',
            input: sourceOutput,
            outputs: [buildOutput],
            project: project
        });

        const manualApproval = new ManualApprovalAction({
            actionName: 'Approval',
            notificationTopic: manualApprovalTopic,
            notifyEmails: [this.email],
            runOrder: 1
        });
        const ecsDeployAction = new EcsDeployAction({
            actionName: 'Deploy',
            input: buildOutput,
            service: this.service,
            runOrder: 2
        });

        const pipeline = new CodePipeline(this, 'Pipeline', {
            stages: [
                {
                    stageName: 'Source',
                    actions: [codeStarConnectionSourceAction],
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
        pipeline.role.addToPrincipalPolicy(this.useConnectionPolicy);

        // Add slack channel notification support for pipeline
        const slackChannel = new SlackChannelConfiguration(this, 'BuilderHubSlack', {
            slackChannelConfigurationName: 'builder-automation',
            slackWorkspaceId: this.slackWorkspaceId,
            slackChannelId: this.slackChannelId,
        });
        slackChannel.addNotificationTopic(manualApprovalTopic)
        pipeline.notifyOnExecutionStateChange('NotifyOnExecutionStateChange', slackChannel);

        return pipeline;
    }

    private createProject(): Project {
        const gitHubSource = Source.gitHub({
            owner: this.owner,
            repo: this.repo,
            webhook: true, // optional, default: true if `webhookFilters` were provided, false otherwise
            webhookFilters: [
                FilterGroup.inEventOf(EventAction.PUSH).andBranchIs(this.branch),
            ], // optional, by default all pushes and Pull Requests will trigger a build
            fetchSubmodules: true
        });

        const project = new Project(
            this,
            'Project',
            {
                buildSpec: this.createBuildSpec(),
                source: gitHubSource,
                environment: {
                    buildImage: LinuxBuildImage.STANDARD_5_0,
                    privileged: true,
                    environmentVariables: {
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
        project.role?.addToPrincipalPolicy(this.useConnectionPolicy)
        return project;
    }

    createBuildSpec(): BuildSpec {
        return BuildSpec.fromObject({
            version: '0.2',
            phases: {
                pre_build: {
                    commands: [
                        'echo Logging in to Amazon ECR...',
                        'aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com',
                        'echo Logged in to ECR with $AWS_ACCOUNT_ID $AWS_REGION',
                        'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
                        'IMAGE_TAG=${COMMIT_HASH:=latest}',
                        'echo Ready to build on commit=$COMMIT_HASH with image=$IMAGE_TAG...'
                    ]
                },
                build: {
                    commands: [
                        'echo Build started on `date`',
                        'echo Building the Docker image with $REPOSITORY_URI...',
                        'docker build -t $REPOSITORY_URI:latest .',
                        'echo Tagging the built docker image with $IMAGE_TAG...',
                        'docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG',
                    ]
                },
                post_build: {
                    commands: [
                        'echo Build completed on `date`',
                        'echo Pushing the Docker image to ${REPOSITORY_URI}:latest...',
                        'docker push $REPOSITORY_URI:latest',
                        'echo Pushing the Docker image to ${REPOSITORY_URI}:$IMAGE_TAG...',
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