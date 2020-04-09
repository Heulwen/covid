import * as moment from "moment";
import * as d3 from "d3";
import * as Plotly from "plotly.js";
import { parseMeasures } from "./measures";
import * as chroma from "chroma-js";
import { interpolateInferno } from "d3";

const GRAPH_HEIGHT = 600;

// graph layout
let layout: Partial<Plotly.Layout> = {
  height: GRAPH_HEIGHT,
  //margin: { t: 0 },
  paper_bgcolor: "#222028",
  plot_bgcolor: "#222028",
  hovermode: "closest",
  xaxis: {
    type: "date",
    ticks: "outside",
    tickfont: {
      family: "DM Sans, sans-serif",
      size: 14,
      color: "white"
    },
    tick0: 0,
    dtick: 0.0,
    ticklen: 8,
    tickwidth: 1,
    tickcolor: "#fff",
    showline: true,
    autorange: "reversed"
  },
  yaxis: {
    title: "Symptomatic patients",
    titlefont: {
      family: "DM Sans, sans-serif",
      size: 16,
      color: "white"
    },
    tickfont: {
      family: "DM Sans, sans-serif",
      // size: 14,
      color: "white"
    },
    ticks: "outside",
    tick0: 0,
    dtick: 0.0,
    ticklen: 8,
    tickwidth: 1,
    tickcolor: "#fff",
    showline: true,
    linecolor: "#fff",
    linewidth: 1,
    showgrid: false,
    zeroline: true,
    zerolinecolor: "#fff",
    zerolinewidth: 1,
    type: "log",
    domain: [0, 1]
  },
  yaxis2: {
    domain: [0, 0],
    tickfont: {
      family: "DM Sans, sans-serif",
      size: 14,
      color: "white"
    },
    automargin: true // FIXME
  },
  showlegend: false,
  barmode: "overlay",
  legend: {
    x: 1,
    xanchor: "right",
    y: 1,
    yanchor: "top",
    bgcolor: "#22202888",
    font: {
      color: "#fff"
    }
  },
  grid: { rows: 2, columns: 1, pattern: "independent" }
};

let config = {
  displaylogo: false,
  responsive: true,
  scrollZoom: false
};

// coefficent of variation
function relativeVariance(value, mean) {
  let relativeSD = (value - mean) / mean;
  return relativeSD * relativeSD;
}

function applyVariance(mean, vars, sigma) {
  let totalVar = 0;
  vars.forEach(v => {
    totalVar += v * v;
  });

  let val = mean * Math.exp(sigma * Math.sqrt(totalVar));
  return val;
}

const INCUBATION_PERIOD = 5;
const ONSET_TO_DEATH = 9;

type Mode = "percentage" | "absolute";

export class CurrentChart {
  mode: Mode;
  $container: Plotly.PlotlyHTMLElement;
  graphDomain: [number, number];
  measureDomain: [number, number];

  constructor($container, mode: Mode = "absolute") {
    this.mode = mode;
    this.$container = $container;
    Plotly.newPlot($container, [], layout, config);

    this.initEvents();
  }

  makeErrorTrace({ color, fillcolor, name }, data): Array<Plotly.Data> {
    let errorXs = [];
    let errorYs = [];
    let meanYs = [];
    let meanXs = [];

    data.forEach(({ date, high, mean }) => {
      errorYs.push(high);
      errorXs.push(date);

      meanYs.push(mean);
      meanXs.push(date);
    });

    for (let i = data.length - 1; i >= 0; i--) {
      let { date, low } = data[i];
      errorYs.push(low);
      errorXs.push(date);
    }

    // error bars
    let errorTrace: Plotly.Data = {
      y: errorYs,
      x: errorXs,
      mode: "lines",
      line: { color: "transparent" },
      fillcolor: fillcolor,
      fill: "tozerox",
      type: "scatter",
      showlegend: false,
      hoverinfo: "skip"
    };

    let f = d3.format(".2s");
    // estimation
    let meanTrace: Plotly.Data = {
      mode: "lines",
      x: meanXs,
      y: meanYs,
      line: { color: color },
      type: "scatter",
      name: name,
      hoverinfo: "text",
      text: data.map(({ low, high }) => `${name}: ${f(low)}-${f(high)}`)
    };

    return [meanTrace, errorTrace];
  }

  addHistoricalCases(target, regionData, ratesData, cb) {
    let cfr = ratesData.cfr;

    // this is the standard deviation (for plotting) in the log of cfr
    // for example with `log_cfr_var = 0.69` we get
    //    lower confidence bound `= cfr / exp(0.69) = cfr / 2`
    //    upper conficence bound `= cfr * exp(0.69) = 2 cfr`
    let log_cfr_var = 0.69; // exp(0.69) = 2

    let scale_factor = 1;
    if (this.mode == "percentage") {
      scale_factor = regionData.population;
    }

    // retriveHistorical('italy', ({confirmed, deaths, dates}) => {
    //   // let highestVals = [];

    let timeseries = regionData.data.estimates.days;

    let cv = 3;
    let retrodicted = [];
    let reported = [];
    Object.keys(timeseries).forEach(date => {
      let { JH_Deaths: deaths, JH_Infected: confirmed } = timeseries[date];

      if (confirmed > 0) {
        reported.push({
          date: date,
          confirmed: confirmed / scale_factor,
          deaths: deaths / scale_factor
        });
      }

      if (deaths > 0) {
        let mean = deaths / cfr / scale_factor;
        let low = applyVariance(
          mean,
          [log_cfr_var, cv / Math.sqrt(deaths)],
          -1
        );
        let high = applyVariance(
          mean,
          [log_cfr_var, cv / Math.sqrt(deaths)],
          1
        );

        retrodicted.push({
          date: moment(date)
            .subtract(ONSET_TO_DEATH, "days")
            .toDate(),
          low: low,
          mean: mean,
          high: high
        });
      }
    });

    let symtomaticTraces = this.makeErrorTrace(
      {
        color: "white",
        fillcolor: "rgba(255,255,255,0.3)",
        name: "Symptomatic (est.)"
      },
      retrodicted
    );

    let reportedXs = [];
    let reportedYs = [];
    let lastConfirmed = 0;
    reported.forEach(({ date, confirmed }) => {
      if (lastConfirmed !== confirmed) {
        reportedXs.push(date);
        reportedYs.push(confirmed);
        lastConfirmed = confirmed;
      }
    });

    let reportedConfirmed: Plotly.Data = {
      mode: "markers",
      x: reportedXs,
      y: reportedYs,
      line: { color: "#fff" },
      type: "scatter",
      name: "Confirmed",
      marker: { size: 3 },
      hovertemplate: "Confirmed: %{y:.3s}"
    };

    let data: Array<Partial<Plotly.Data>> = [
      reportedConfirmed,
      ...symtomaticTraces
    ];

    // redraw the lines on the graph
    Plotly.addTraces(target, data);

    if (cb) {
      cb(retrodicted, reported);
    }
  }

  update(regionData, measureData, ratesData) {
    Plotly.react(this.$container, [], layout, config);

    this.updateHistorical(regionData, ratesData);

    // addCurrentTraces(function (traces) {
    //   // redraw the lines on the graph
    //   Plotly.addTraces($container, traces);
    //   //addCriticalCareTrace(currentGraph, d3.extent(traces[0].x));
    // })

    this.updateMeasures(measureData);
  }

  updateHistorical(regionData, ratesData) {
    this.addHistoricalCases(
      this.$container,
      regionData,
      ratesData,
      (retrodicted, reported) => {
        // function mkDeltaTrace(name, other) {
        //   return {
        //     x: [],
        //     y: [],
        //     name: `Δ ${name}`,
        //     histfunc: "sum",
        //     marker: {
        //       color: "rgba(255, 100, 102, 0.7)",
        //       line: {
        //         color: "rgba(255, 100, 102, 1)",
        //         width: 1
        //       }
        //     },
        //     autobinx: false,
        //     xbins:{size: "D1"},
        //     hovertemplate: "+%{y}",
        //     opacity: 0.5,
        //     type: "histogram",
        //     ...other
        //   }
        // }

        // let predictedDeltas = mkDeltaTrace("Predicted");
        // for(let i = 1; i < retrodicted.length; i++){
        //   let delta = retrodicted[i].mean - retrodicted[i-1].mean;
        //   predictedDeltas.x.push(retrodicted[i].date);
        //   predictedDeltas.y.push(delta);
        // }

        // let confirmedDeltas = mkDeltaTrace("Confirmed");
        // let deathsDeltas = mkDeltaTrace("Deaths");
        // for(let i = 1; i < reported.length; i++){
        //   let {date, confirmed, deaths} = reported[i];

        //   confirmedDeltas.x.push(date);
        //   confirmedDeltas.y.push(confirmed - reported[i-1].confirmed);

        //   deathsDeltas.x.push(date);
        //   deathsDeltas.y.push(deaths - reported[i-1].deaths);
        // }

        // Plotly.addTraces(currentGraph, [predictedDeltas, deathsDeltas, confirmedDeltas]);

        let startDate = "2020-03-01";
        if (retrodicted.length != 0) {
          startDate = reported[0].date;
        }

        let endDate = moment().toDate();

        Plotly.relayout(this.$container, {
          "xaxis.range": [startDate, endDate]
        });
      }
    );
  }

  initEvents() {
    this.$container.on("plotly_unhover", () => {
      Plotly.relayout(this.$container, {
        shapes: []
      });
    });

    this.$container.on("plotly_hover", evt => {
      let measure = (evt.points[0] as any).customdata;
      let measureShapes = [];

      if (!measure || !measure.start || !measure.end) return;

      let { start, end } = measure;
      measureShapes.push({
        type: "line",
        yref: "paper",
        x0: moment(start).valueOf(),
        y0: 0,
        x1: moment(start).valueOf(),
        y1: 1,
        line: { color: "white" },
        opacity: 0.5
      });

      measureShapes.push({
        type: "rect",
        yref: "paper",
        x0: moment(start)
          .add(INCUBATION_PERIOD, "days")
          .toDate(),
        y0: this.graphDomain[0],
        x1: moment(end)
          .add(INCUBATION_PERIOD, "days")
          .toDate(),
        y1: this.graphDomain[1],
        fillcolor: "white",
        line: { color: "transparent" },
        opacity: 0.1
      });

      Plotly.relayout(this.$container, {
        shapes: measureShapes
      });
    });
  }

  updateMeasures(measureData) {
    let measures = parseMeasures(measureData);

    console.log(measures);

    let measureTrace = {
      base: [],
      x: [],
      y: [],
      hoverinfo: "text",
      textposition: "inside",
      text: [],
      yaxis: "y2",
      type: "bar",
      orientation: "h",
      marker: { color: [] } as Plotly.ScatterMarker,
      customdata: []
    };

    measures.periods.forEach(info => {
      let { measure, color, label, start, replaced } = info;

      let x0 = moment(start).valueOf();
      let x1 = moment(replaced)
        .add({ days: 1 })
        .valueOf(); // add a day to prevent non overlap

      measureTrace.base.push(x1);
      measureTrace.x.push(x0 - x1);
      measureTrace.text.push(label);
      measureTrace.customdata.push(info);
      measureTrace.y.push(measure);
      (measureTrace.marker.color as string[]).push(color.css());
    });

    // let measuresTraces = []
    // measures.forEach(({start, type}) => {
    //   start = moment(start);
    //   let end = moment(start).add(10,"days");
    //   console.log(start, end, type)

    //   //measuresTraces.push();

    //   measuresTraces.push({
    //     base: start.valueOf(),
    //     x: end.valueOf()-start.valueOf(),
    //     y: type,
    //     yaxis: "y2",
    //     type: 'bar',
    //     orientation: 'h',
    //     marker: {color: "rgba(255,255,255,0.3)"},
    //     hoverinfo: "y"
    //   });
    // })

    this.resize(measures.count);

    Plotly.addTraces(this.$container, measureTrace as Plotly.Data);
  }

  resize(measureCount) {
    let height = GRAPH_HEIGHT;
    if (measureCount === 0) {
      this.measureDomain = [0, 0];
      this.graphDomain = [0, 1];
    } else {
      this.measureDomain = [0, 0.05 * measureCount];
      this.graphDomain = [0.05 * measureCount + 0.1, 1];
      height /= 1 - 0.05 * measureCount - 0.1;
    }

    Plotly.relayout(this.$container, {
      "yaxis.domain": this.graphDomain,
      "yaxis2.domain": this.measureDomain,
      height
    } as any);
  }
}
