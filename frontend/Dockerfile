# Stage 1: build the React app (Vue is added to this stage later)
FROM node:20-alpine AS react-build
WORKDIR /build
COPY frontend/react-app/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/react-app/ ./
RUN npm run build

# Stage 2: serve only the built output, URDF/meshes and config
FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=react-build /build/dist /usr/share/nginx/html
COPY backend/urdf/ /usr/share/nginx/html/urdf/
COPY config/cell.yaml /usr/share/nginx/html/config/cell.yaml
