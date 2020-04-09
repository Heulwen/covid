import { Router, RequestHandler } from "express";

// identifiers for the pages
const MODELS = "models";
const CASE_MAP = "case-map";
const MITIGATION = "mitigation";
const REQUEST_MODEL = "request-model";
const ABOUT = "about";
const MEASURES = "measures";

// order of the pages as diplayed in the navigation bar
let navigation = [MODELS, MEASURES, CASE_MAP, MITIGATION, REQUEST_MODEL, ABOUT];

type NavBarEntry = { path: string; id: string; caption: string };

let pages: { [key: string]: NavBarEntry } = {};
function add(
  id: string,
  opts: { path: string; caption: string },
  handler: RequestHandler
) {
  let { path, caption } = opts;
  pages[id] = { path, id, caption };

  router.get(
    path,
    (req, res, next) => {
      res.locals.active_page = id;
      next();
    },
    handler
  );
  return id;
}

export let router = Router();

// serve the main model visualization
add(MODELS, { path: "/", caption: "Models" }, (req, res) =>
  res.render("model.html")
);

add(CASE_MAP, { path: "/case-map", caption: "Case map" }, (req, res) =>
  res.render("case-map.html")
);

add(MEASURES, { path: "/measures", caption: "Measures" }, (req, res) =>
  res.render("measures.html")
);

add(MITIGATION, { path: "/containment", caption: "Dataset" }, (req, res) =>
  res.render("containment.html")
);

add(
  REQUEST_MODEL,
  { path: "/request-calculation", caption: "Request model" },
  (req, res) =>
    res.render("request-calculation.html", { message: "Please provide data" })
);

add(ABOUT, { path: "/about", caption: "About" }, (req, res) =>
  res.render("about.html")
);

// Not sure why, but we had a lot of 404 in access log for this URL
router.get("/containment.", (req, res) => res.redirect("/containment"));

export let navigation_bar = navigation.map(key => pages[key]);