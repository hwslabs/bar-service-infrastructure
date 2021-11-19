import ec2 = require('@aws-cdk/aws-ec2');
import ecr = require('@aws-cdk/aws-ecr');
import ecs = require('@aws-cdk/aws-ecs');
import ecs_patterns = require('@aws-cdk/aws-ecs-patterns');
import cdk = require('@aws-cdk/core');
import {ApplicationProtocol, ApplicationProtocolVersion} from "@aws-cdk/aws-elasticloadbalancingv2";
import {HostedZone} from "@aws-cdk/aws-route53";
import {RemovalPolicy} from "@aws-cdk/core";
import {Environment} from "@aws-cdk/core/lib/environment";
import {DnsValidatedCertificate} from "@aws-cdk/aws-certificatemanager";

class {TEMPLATE_SERVICE_NAME}ServiceRepository extends cdk.Stack {
  public readonly repository: ecr.IRepository;

  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // Create ECR repository
    this.repository = new ecr.Repository(this, '{TEMPLATE_SERVICE_HYPHEN_NAME}-service', {
      repositoryName: '{TEMPLATE_SERVICE_HYPHEN_NAME}-service',
      removalPolicy: RemovalPolicy.DESTROY
    })
  }
}

interface {TEMPLATE_SERVICE_NAME}ServiceRepositoryProps extends cdk.StackProps {
  readonly repository: ecr.IRepository;
  readonly env?: Environment;
}

class {TEMPLATE_SERVICE_NAME}ServiceFargate extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: {TEMPLATE_SERVICE_NAME}ServiceRepositoryProps) {
    super(scope, id, props);

    const zoneName = '{TEMPLATE_AWS_ZONE_NAME}';
    const domainName = `{TEMPLATE_SERVICE_HYPHEN_NAME}.${zoneName}`;
    const domainZone = HostedZone.fromLookup(this, 'StagingZone', { domainName: zoneName });

    // Create VPC and Fargate Cluster
    // NOTE: Limit AZs to avoid reaching resource quotas
    const vpc = new ec2.Vpc(this, '{TEMPLATE_SERVICE_NAME}ServiceVpc', { maxAzs: 2 });
    const cluster = new ecs.Cluster(this, '{TEMPLATE_SERVICE_NAME}ServiceCluster', { vpc });

    const certificate = new DnsValidatedCertificate(this, 'Certificate', {
      domainName,
      hostedZone: domainZone
    });

    // Instantiate Fargate Service with an application load balancer
    new ecs_patterns.ApplicationLoadBalancedFargateService(this, "{TEMPLATE_SERVICE_NAME}Service", {
      cluster,
      protocol: ApplicationProtocol.HTTPS,
      listenerPort: 50051,
      domainName,
      domainZone,
      certificate,
      targetProtocol: ApplicationProtocol.HTTP,
      protocolVersion: ApplicationProtocolVersion.GRPC,
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(props.repository),
        containerPort: 50051
      },
    });
  }
}

const app = new cdk.App();

const repositoryStack = new {TEMPLATE_SERVICE_NAME}ServiceRepository(app, 'repo', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
})
new {TEMPLATE_SERVICE_NAME}ServiceFargate(app, 'service', {
  repository: repositoryStack.repository,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
})

app.synth();
