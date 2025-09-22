docker build -t registry.cn-hangzhou.aliyuncs.com/one-registry/play-pdf-server .
docker push registry.cn-hangzhou.aliyuncs.com/one-registry/play-pdf-server

cd ..
docker compose up -d