FROM node
WORKDIR /app
COPY package.json /app
RUN npm install
COPY . /app
RUN npm run build
ENV TS_NODE_BASEURL=./.build
CMD ["npm", "run", "serve"]