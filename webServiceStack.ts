import { WebService } from './webService';
import { WebServicePipeline } from './webServicePipeline';
import { WebServiceCluster } from './webServiceCluster';
import {App, Construct, Stack, StackProps} from "@aws-cdk/core";

class WebServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const cluster = new WebServiceCluster(this, 'Cluster');
    const webService = new WebService(this, 'WebService', { cluster });
    new WebServicePipeline(this, 'WebServicePipeline', { webService });
  }
}

const app = new App();
new WebServiceStack(app, 'BarServiceStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  }
});
app.synth();