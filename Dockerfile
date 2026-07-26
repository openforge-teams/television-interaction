# ====== 构建阶段 ======
FROM node:20-alpine AS builder

WORKDIR /app

# 复制依赖清单，利用 Docker 层缓存
COPY package.json package-lock.json* ./

# 安装全部依赖（含 devDependencies，用于构建）
RUN npm ci || npm install --ignore-scripts

# 复制源码
COPY . .

# 构建生产产物
RUN npm run build

# ====== 运行阶段 ======
FROM node:20-alpine AS runner

WORKDIR /app

# 安装轻量级静态文件服务器
RUN npm install -g serve@14

# 从构建阶段复制打包产物
COPY --from=builder /app/dist ./dist

# 环境变量
ENV NODE_ENV=production
ENV PORT=5173

EXPOSE 5173

# 单进程，前台运行，方便 docker logs 查看
CMD ["sh", "-c", "serve -s dist -l ${PORT}"]
