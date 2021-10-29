# Bar Service Infrastructure

![](logo/hypto_grpc_kotlin.png)

## Overview

AWS CDK Infrastructure package to deploy the ECR repository that holds the server container 
and actual infrastructure that runs the bar service server remotely on an application load 
balanced ECS Fargate service

- **Bar Service Infrastructure** using AWS and CDK. For details, see the [project on github](https://github.com/hwslabs/bar-service-infrastructure).

## File organization

The infra sources are organized into the following files:

- [package.json](package.json): Package dependecies for npm 
- [index.ts](index.ts): CDK implementation in typescript

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