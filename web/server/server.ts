import compression from "compression";
import express from "express";
import morgan from "morgan";
import nunjucks from "nunjucks";
import * as path from "path";
import { env } from "process";
import webpack from "webpack";
import webpackDev from "webpack-dev-middleware";

import { Alert } from "../common/alert";
import constants from "../common/constants";
import webpackConfig from "../webpack.config";
import { navigation_bar, router } from "./routes";

const PORT = process.env.PORT || 8000;

export let app = express();

// set up compression, threshold default is 1 kb
app.use(compression());

// set up logging
app.use(morgan(app.get("env") === "development" ? "dev" : "short"));

// set up nunjucks as templating engine
nunjucks.configure(path.join(__dirname, "templates"), {
  autoescape: true,
  express: app,
});

app.locals.DEFAULT_EPIFOR_CHANNEL =
  process.env.DEFAULT_EPIFOR_CHANNEL ?? "testing";

let REACT_BUILD: "production" | "development" =
  app.get("env") === "production" ? "production" : "development";
app.locals.REACT_BUILD = REACT_BUILD;

// set up the static file server, but only if we get no STATIC_URL
if (!process.env.STATIC_URL) {
  let mount = "/static";

  app.locals.ASSET_ROOT = mount;
  app.use(mount, express.static(path.join(__dirname, "../static")));
} else {
  app.locals.ASSET_ROOT = process.env.STATIC_URL;
}

// add local constants
for (let key in constants) {
  app.locals[key] = constants[key];
}

let proBonoAlert: Alert = {
  id: "consultingAlert",
  dismissalDuration: { days: 1 },
  revision: "0",
  content: `We offer custom forecasting and modeling for decision makers and clinical trial design. Please reach out <a href="http://epidemicforecasting.org/submit-request" 
  class="alert-link">here</a>.`,
};

app.use(function (req, res, next) {
  let channel = req.query.channel ?? constants["DEFAULT_EPIFOR_CHANNEL"];
  res.locals.CHANNEL = channel;
  res.locals.ALERTS = [proBonoAlert];

  if (channel == "balochistan") {
    res.redirect("http://balochistan.epidemicforecasting.org/");
  } else {
    next();
  }
});

if (app.get("env") === "development") {
  // on development we run webpack for serving bundles
  let publicPath = "/webpack";

  webpackConfig.mode = "development";
  let compiler = webpack(webpackConfig);

  app.use(webpackDev(compiler, { publicPath }));

  app.locals.BUNDLE_LOCATION = publicPath;
} else {
  app.locals.BUNDLE_LOCATION = app.locals.ASSET_ROOT;
}

// make the navigation structure availible and load the routes
app.locals.navigation_bar = navigation_bar;
app.use(router);

// status route
const APP_NAME: string = `${env.npm_package_name} ${env.npm_package_version}`;
app.get("/status", (_req, res) =>
  res.json({
    app: APP_NAME,
    nodeEnv: app.get("env"),
    version: process.env.APP_VERSION,
    epiforChannel: process.env.DEFAULT_EPIFOR_CHANNEL,
  })
);

// finally serve
export let server = app.listen(PORT, function () {
  console.log(`Running ${APP_NAME} on *:${PORT} with mode ${app.get("env")}`);
});
