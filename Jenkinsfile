pipeline {
    agent any

    environment {
        DOCKER_HUB_USER   = 'hasham17'        // ← Change this
        IMAGE_NAME        = 'hasham-portfolio'
        CONTAINER_NAME    = 'hasham-portfolio'
        HOST_PORT         = '8080'
        CONTAINER_PORT    = '80'
        DOCKER_CREDENTIALS = 'dockerhub-credentials'         // Jenkins credential ID
    }

    // Only run pipeline when a tag is pushed (v*)
    triggers {
        githubPush()
    }

    stages {

        stage('Validate Tag') {
            steps {
                script {
                    // Only proceed if this build was triggered by a tag
                    if (!env.TAG_NAME) {
                        error("❌ This pipeline only runs on tag pushes. Current ref: ${env.GIT_BRANCH}")
                    }
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
                    def imageTag = "${DOCKER_HUB_USER}/${IMAGE_NAME}:${env.TAG_NAME}"
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
                echo "✅ Image pushed: ${env.IMAGE_TAG}"
            }
        }

        stage('Deploy on Docker') {
            steps {
                script {
                    echo "🚀 Deploying container: ${CONTAINER_NAME}"
                    sh """
                        # Stop & remove old container if running
                        docker stop ${CONTAINER_NAME} 2>/dev/null || true
                        docker rm   ${CONTAINER_NAME} 2>/dev/null || true

                        # Pull fresh image and run
                        docker pull ${env.IMAGE_TAG}

                        docker run -d \
                            --name ${CONTAINER_NAME} \
                            --restart unless-stopped \
                            -p ${HOST_PORT}:${CONTAINER_PORT} \
                            ${env.IMAGE_TAG}

                        echo "✅ Container is running on port ${HOST_PORT}"
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
                sh """
                    # Remove dangling images to free disk space
                    docker image prune -f
                """
                echo "✅ Cleanup done"
            }
        }
    }

    post {
        success {
            echo """
            ═══════════════════════════════════════
            ✅ PIPELINE SUCCESSFUL
            Tag      : ${env.TAG_NAME}
            Image    : ${env.IMAGE_TAG}
            URL      : http://<your-server-ip>:${HOST_PORT}
            ═══════════════════════════════════════
            """
        }
        failure {
            echo "❌ Pipeline FAILED for tag: ${env.TAG_NAME}"
        }
        always {
            // Clean workspace
            cleanWs()
        }
    }
}
