pipeline {
    agent any

    environment {
        DOCKER_HUB_USER    = 'hasham17'
        IMAGE_NAME         = 'hasham-portfolio'
        CONTAINER_NAME     = 'hasham-portfolio'
        HOST_PORT          = '8080'
        CONTAINER_PORT     = '80'
        DOCKER_CREDENTIALS = 'dockerhub-credentials'
    }

    triggers {
        githubPush()
    }

    stages {

        stage('Validate Tag') {
            steps {
                script {
                    // Try env.TAG_NAME first
                    def tag = env.TAG_NAME

                    // If null, extract from GIT_BRANCH (refs/tags/v1.0.0 → v1.0.0)
                    if (!tag) {
                        def branch = env.GIT_BRANCH ?: ''
                        if (branch.contains('tags/')) {
                            tag = branch.tokenize('/')[-1]
                        }
                    }

                    // If still null, ask git directly
                    if (!tag) {
                        tag = sh(
                            script: "git describe --tags --exact-match HEAD 2>/dev/null || echo ''",
                            returnStdout: true
                        ).trim()
                    }

                    if (!tag) {
                        error("❌ Could not detect tag. GIT_BRANCH=${env.GIT_BRANCH}")
                    }

                    env.TAG_NAME = tag
                    echo "✅ Tag detected: ${env.TAG_NAME}"
                }
            }
        }

        stage('Checkout') {
            steps {
                checkout scm
                echo "✅ Code checked out — tag: ${env.TAG_NAME}"
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    def imageTag    = "${DOCKER_HUB_USER}/${IMAGE_NAME}:${env.TAG_NAME}"
                    def imageLatest = "${DOCKER_HUB_USER}/${IMAGE_NAME}:latest"

                    echo "🔨 Building image: ${imageTag}"
                    sh "docker build -t ${imageTag} -t ${imageLatest} ."

                    env.IMAGE_TAG    = imageTag
                    env.IMAGE_LATEST = imageLatest
                }
            }
        }

        stage('Push to Docker Hub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: "${DOCKER_CREDENTIALS}",
                    usernameVariable: 'DH_USER',
                    passwordVariable: 'DH_PASS'
                )]) {
                    sh """
                        echo \$DH_PASS | docker login -u \$DH_USER --password-stdin
                        docker push ${env.IMAGE_TAG}
                        docker push ${env.IMAGE_LATEST}
                        docker logout
                    """
                }
                echo "✅ Pushed: ${env.IMAGE_TAG}"
            }
        }

        stage('Deploy on Docker') {
            steps {
                script {
                    echo "🚀 Deploying: ${CONTAINER_NAME}"
                    sh """
                        docker stop ${CONTAINER_NAME} 2>/dev/null || true
                        docker rm   ${CONTAINER_NAME} 2>/dev/null || true

                        docker pull ${env.IMAGE_TAG}

                        docker run -d \
                            --name ${CONTAINER_NAME} \
                            --restart unless-stopped \
                            -p ${HOST_PORT}:${CONTAINER_PORT} \
                            ${env.IMAGE_TAG}

                        echo "✅ Container running on port ${HOST_PORT}"
                        docker ps | grep ${CONTAINER_NAME}
                    """
                }
            }
        }

        stage('Health Check') {
            steps {
                script {
                    sleep(time: 5, unit: 'SECONDS')
                    def status = sh(
                        script: "curl -s -o /dev/null -w '%{http_code}' http://localhost:${HOST_PORT}",
                        returnStdout: true
                    ).trim()
                    if (status == '200') {
                        echo "✅ Health check passed — HTTP ${status}"
                    } else {
                        error("❌ Health check failed — HTTP ${status}")
                    }
                }
            }
        }

        stage('Cleanup Old Images') {
            steps {
                sh "docker image prune -f"
                echo "✅ Cleanup done"
            }
        }
    }

    post {
        success {
            echo """
            ═══════════════════════════════════════
            ✅ PIPELINE SUCCESSFUL
            Tag   : ${env.TAG_NAME}
            Image : ${env.IMAGE_TAG}
            URL   : http://localhost:${HOST_PORT}
            ═══════════════════════════════════════
            """
        }
        failure {
            echo "❌ Pipeline FAILED for tag: ${env.TAG_NAME}"
        }
        always {
            cleanWs()
        }
    }
}
