import { WebService } from './webService';
import { WebServicePipeline } from './webServicePipeline';
import { WebServiceCluster } from './webServiceCluster';
import {App, Construct, Stack, StackProps} from "@aws-cdk/core";

class WebServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // TODO: name the cluster better
    const cluster = new WebServiceCluster(this, 'HyptoCluster');
    const webService = new WebService(this, 'WebService', { cluster });
    new WebServicePipeline(this, 'WebServicePipeline', { webService });
  }
}

const app = new App();
new WebServiceStack(app, 'BarServiceStack');
app.synth();