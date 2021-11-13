import {CfnOutput, Construct} from '@aws-cdk/core';
import {HostedZone, IHostedZone} from "@aws-cdk/aws-route53";
import {Vpc} from "@aws-cdk/aws-ec2";
import {Cluster as EcsCluster} from "@aws-cdk/aws-ecs";

class WebServiceCluster extends Construct {
    readonly ecsCluster: EcsCluster;
    readonly domainZone: IHostedZone;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        /*
        This is a clear HARDCODE!!
        TODO: Make this more generic coming from a config.
        */
        const zoneName = 'hypto.co.in';

        this.domainZone = HostedZone.fromHostedZoneAttributes(this, 'StagingZone', {
            zoneName,
            /*
            This is a clear HARDCODE!!
            TODO: Make this more generic coming from a config.
            */
            hostedZoneId: 'Z30STQ6IYSMMOI',
        });

        // Create VPC and ECS Cluster
        // NOTE: Limit AZs to avoid reaching resource quotas
        const vpc = new Vpc(this, 'BarServiceVpc', { maxAzs: 2 });
        this.ecsCluster = new EcsCluster(this, 'BarServiceCluster', { vpc });
        this.output();
    }

    output() {
        new CfnOutput(this, 'BarService_ECSCluster_ARN', {value: this.ecsCluster.clusterArn});
    }
}

export {WebServiceCluster};