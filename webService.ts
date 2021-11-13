import {CfnOutput, Construct, Duration} from '@aws-cdk/core';
import {Cluster as EcsCluster, ContainerImage, IBaseService} from "@aws-cdk/aws-ecs";
import {WebServiceCluster} from './webServiceCluster';
import {ApplicationProtocol, ApplicationProtocolVersion} from "@aws-cdk/aws-elasticloadbalancingv2";
import {Certificate, ValidationMethod} from "@aws-cdk/aws-certificatemanager";
import {IHostedZone} from "@aws-cdk/aws-route53";
import {ApplicationLoadBalancedFargateService} from "@aws-cdk/aws-ecs-patterns";
import {Repository} from "@aws-cdk/aws-ecr";

interface WebServiceProps {
    readonly cluster: WebServiceCluster;
}

class WebService extends Construct {
    private fargateService: ApplicationLoadBalancedFargateService;

    public readonly service: IBaseService;
    public readonly containerName: string;
    public readonly ecrRepo: Repository;

    constructor(scope: Construct, id: string, props: WebServiceProps) {
        super(scope, id);
        this.fargateService = this.createService(props.cluster.ecsCluster, props.cluster.domainZone);

        this.ecrRepo = new Repository(this, 'Repo');
        this.ecrRepo.grantPull(this.fargateService.taskDefinition.executionRole!);
        this.service = this.fargateService.service;
        this.containerName = this.fargateService.taskDefinition.defaultContainer!.containerName;

        this.addAutoScaling();
        this.output();
    }

    private createService(cluster: EcsCluster, domainZone: IHostedZone) {
        /*
        This is a clear HARDCODE!!
        TODO: Make this more generic coming from a config.
        */
        const domainName = 'hws.bar.hypto.co.in';

        const certificate = new Certificate(this, 'Certificate', {
            domainName,
            validationMethod: ValidationMethod.DNS
        });

        // Instantiate Fargate Service with an application load balancer
        return new ApplicationLoadBalancedFargateService(this, "Service", {
            cluster,
            // securityGroups: [grpcSg],
            protocol: ApplicationProtocol.HTTPS,
            listenerPort: 50051,
            domainName,
            domainZone,
            certificate,
            targetProtocol: ApplicationProtocol.HTTP,
            protocolVersion: ApplicationProtocolVersion.GRPC,
            taskImageOptions: {
                //TODO: Fix hardcoded path below
                image: ContainerImage.fromAsset('../bar-service-kotlin-server/'),
                containerPort: 50051
            },
        });
    }

    private addAutoScaling() {
        const autoScalingGroup = this.fargateService.service.autoScaleTaskCount({
            minCapacity: 2,
            maxCapacity: 10
        });
        autoScalingGroup.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: 50,
            scaleInCooldown: Duration.seconds(60),
            scaleOutCooldown: Duration.seconds(60),
        });
    }

    private output() {
        new CfnOutput(this, 'ECRRepo_ARN', {value: this.ecrRepo.repositoryArn});
        new CfnOutput(this, 'ContainerName', {value: this.containerName});
    }
}

export {WebService, WebServiceProps};