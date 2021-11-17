import {CfnOutput, Construct} from '@aws-cdk/core';
import {HostedZone, IHostedZone} from "@aws-cdk/aws-route53";
import {Vpc} from "@aws-cdk/aws-ec2";
import {Cluster as EcsCluster} from "@aws-cdk/aws-ecs";

class WebServiceCluster extends Construct {
    readonly ecsCluster: EcsCluster;
    readonly domainZone: IHostedZone;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const zoneName = "hypto.co.in"

        this.domainZone = HostedZone.fromLookup(this, 'StagingZone', { domainName : zoneName });

        // Create VPC and ECS Cluster
        // NOTE: Limit AZs to avoid reaching resource quotas
        const vpc = new Vpc(this, 'Vpc', { maxAzs: 2 });
        this.ecsCluster = new EcsCluster(this, 'Cluster', { vpc });
        this.output();
    }

    output() {
        new CfnOutput(this, 'ECSCluster_ARN', {value: this.ecsCluster.clusterArn});
    }
}

export {WebServiceCluster};