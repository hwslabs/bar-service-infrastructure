import ec2 = require('@aws-cdk/aws-ec2');
import ecr = require('@aws-cdk/aws-ecr');
import ecs = require('@aws-cdk/aws-ecs');
import ecs_patterns = require('@aws-cdk/aws-ecs-patterns');
import cdk = require('@aws-cdk/core');
import certificateManager = require('@aws-cdk/aws-certificatemanager');
import {ValidationMethod} from "@aws-cdk/aws-certificatemanager";
import {ApplicationProtocol, ApplicationProtocolVersion} from "@aws-cdk/aws-elasticloadbalancingv2";

const route53 = require('@aws-cdk/aws-route53')
// const alias = require('@aws-cdk/aws-route53-targets')
// import {DockerImageAsset} from "@aws-cdk/aws-ecr-assets";
// import { join } from "path";


class BarServiceRepository extends cdk.Stack {
  public readonly repository: ecr.IRepository;

  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // Create ECR repository
    this.repository = new ecr.Repository(this, 'bar-service', {
      repositoryName: 'bar-service',
    })

    /***
     *  The below code isn't possible today as CDK doesn't support creating
     *  a new container and pushing it to a custom repository created by us.
     *  DockerImageAsset as of Oct 2021 creates a new container and pushes
     *  only to a predefined cdk-assets repository managed by CDK internally.
     *
     *  Details: https://github.com/aws/aws-cdk/issues/12597
     */
    // TODO: Re-enable functionality to build and push container using CDK
    /*
    // Create a docker image asset in the above ECR repository
    const image = new DockerImageAsset(this, "BarServiceImage", {
      directory:  join(__dirname, "..", "bar-service-kotlin-server"),
    });
    */
  }
}

interface BarServiceRepositoryProps extends cdk.StackProps {
  readonly repository: ecr.IRepository;
}

class BarServiceFargate extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: BarServiceRepositoryProps) {
    super(scope, id, props);

    const zoneName = 'hypto.co.in';
    const domainName = 'hws.bar.hypto.co.in';

    /*
     We try to import  hosted zone from attributes of the Hypto staging account.

     This is a clear HARDCODE!!
     TODO: Make this more generic and working across multiple AWS accounts.
     */
    const domainZone = route53.HostedZone.fromHostedZoneAttributes(this, 'StagingZone', {
      zoneName,
      hostedZoneId: 'Z30STQ6IYSMMOI',
    });

    // Create VPC and Fargate Cluster
    // NOTE: Limit AZs to avoid reaching resource quotas
    const vpc = new ec2.Vpc(this, 'BarServiceVpc', { maxAzs: 2 });
    const cluster = new ecs.Cluster(this, 'BarServiceCluster', { vpc });
    // const grpcSg = new ec2.SecurityGroup(this, 'grpc-security-group', {
    //   vpc,
    //   allowAllOutbound: true,
    //   description: 'GRPC Security Group to allow inbound access on port 50051'
    // });
    //
    // grpcSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(50051), 'gRPC request frm anywhere');

    const certificate = new certificateManager.Certificate(this, 'HyptoCertificate', {
      domainName,
      validationMethod: ValidationMethod.DNS
    });

    // Instantiate Fargate Service with an application load balancer
    new ecs_patterns.ApplicationLoadBalancedFargateService(this, "BarService", {
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
        image: ecs.ContainerImage.fromEcrRepository(props.repository),
        containerPort: 50051
      },
    });

    // new route53.ARecord(this, 'AliasRecord', {
    //   zone: domainZone,
    //   target: route53.RecordTarget.fromAlias(new alias.LoadBalancerTarget(fargateAlbService.loadBalancer)),
    //   recordName: domainName
    // });
  }
}

const app = new cdk.App();

const repositoryStack = new BarServiceRepository(app, 'repo')
new BarServiceFargate(app, 'service', {
  repository: repositoryStack.repository
})

app.synth();
