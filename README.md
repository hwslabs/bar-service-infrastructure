# Bar Service Infrastructure

![](logo/hypto_cdk.png)

## Overview

**Bar Service Infrastructure** using AWS and CDK. For details, see the [project on github](https://github.com/hwslabs/bar-service-infrastructure).

AWS CDK Infrastructure package that creates:
1) An ECS cluster in a multi-AZ VPC
2) An application load balanced Fargate web-service that runs on the above ECS Cluster 
3) A CodeBuild spec that builds the web-service sources from Github and pushes to ECR repo
4) A CodePipeline pipeline with stages to build and deploy changes to the web-service 

## File organization

The infra sources are organized into the following files:

- [package.json](package.json): Package dependecies for npm 
- [webServiceCluster.ts](webServiceCluster.ts): ECS Cluster construct within a dual AZ VPC
- [webservice.ts](webService.ts): WebService construct that defines an application load balanced fargate service
- [webServicePipeline.ts](webServicePipeline.ts): CodePipeline construct with CodeBuild from Github source
- [webServiceStack.ts](webServiceStack.ts): Full web service stack that creates a cluster, web-service and a pipeline

## Set up and deploy the resources from macOS

- <details>
  <summary>Install Homebrew</summary>

  Download and install Homebrew:

  ```sh
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ```

- <details>
  <summary>Install nvm</summary>

  Install latest version of nvm:

  ```sh
  brew install nvm
  ```

- <details>
  <summary>Install any version of Node</summary>

  Install latest version of node:

  ```sh
  nvm install node
  ```

  or any specific version of node:

  ```sh
  nvm install 14.17.6
  ```

- <details>
  <summary>Install CDK</summary>

  Follow the instructions from [AWS CDK Getting Started](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html#getting_started_prerequisites) 
  to configure your AWS account and install CDK

- <details>
  <summary>Run a clean build</summary>

  Run a custom clean build command (installing dependencies is handled part of the command) 

  ```sh
  npm run clean-build
  ```

- <details>
  <summary>Deploy ECR Repo</summary>

  Deploy ECR repo to hold the containers for Bar Service Server

  ```sh
  cdk deploy repo
  ```

- <details>
  <summary>Deploy Bar Server</summary>

  *Note: Between the above step and this step, a valid server container image should be pushed to the 
  ECR repository that was deployed above. Otherwise, there would be nothing to deploy on ECS.*
  
  Deploy the bar service server to an ECS cluster Fargate Service backed by an Application Load Balancer.

  ```sh
  cdk deploy service
  ```