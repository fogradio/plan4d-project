export const benchmarks = [
  {
    name: "EPIC-KITCHENS-100",
    rows: [
      {
        method: "Gen3R",
        values: [".7813", ".3305", ".3641", ".3390", "2.3992", ".3510"],
      },
      {
        method: "TesserAct",
        values: [".8923", ".3343", ".4201", "1.3321", ".0946", ".9736"],
      },
      {
        method: "VIST3A",
        values: [".5499", ".3710", ".1326", "6.4722", "34.7905", ".0184"],
      },
      {
        method: "Plan4D",
        values: [".9506", ".4010", ".0766", ".2321", ".1568", "1.0000"],
      },
    ],
  },
  {
    name: "HoiGen",
    rows: [
      {
        method: "Gen3R",
        values: [".7765", ".6803", ".2881", ".2286", "5.060", ".2689"],
      },
      {
        method: "TesserAct",
        values: [".8661", ".6401", "1.850", ".3534", ".1429", ".9256"],
      },
      {
        method: "VIST3A",
        values: [".6721", ".7851", ".6301", ".7633", "13.09", ".0185"],
      },
      {
        method: "Plan4D",
        values: [".9035", ".6854", ".1125", ".3325", ".1997", ".9809"],
      },
    ],
  },
  {
    name: "Dynamic Replica",
    rows: [
      {
        method: "Gen3R",
        values: [".6833", ".4620", ".2018", "1.034", "22.47", ".1393"],
      },
      {
        method: "TesserAct",
        values: [".8490", ".4419", "1.289", ".4067", ".7609", ".6772"],
      },
      {
        method: "VIST3A",
        values: [".6013", ".5744", ".4084", "1.474", "16.31", ".1230"],
      },
      {
        method: "Plan4D",
        values: [".9356", ".5639", ".0696", ".2579", ".1550", "1.000"],
      },
    ],
  },
  {
    name: "PointOdyssey",
    rows: [
      {
        method: "Gen3R",
        values: [".7486", ".4930", ".4227", ".6703", "9.409", ".2188"],
      },
      {
        method: "TesserAct",
        values: [".9019", ".5094", ".6347", ".3904", ".8804", ".6446"],
      },
      {
        method: "VIST3A",
        values: [".6270", ".5465", ".4371", "1.347", "6.953", ".2962"],
      },
      {
        method: "Plan4D",
        values: [".9233", ".5579", ".0822", ".3013", ".1985", ".9864"],
      },
    ],
  },
];

export const metricNames = [
  "SC ↑",
  "Cap. Sim ↑",
  "AbsRel ↓",
  "Chamfer-L1 ↓",
  "RPE-R ↓",
  "RRA@5 ↑",
];
export const metricDescriptions = [
  "Subject consistency, higher is better",
  "Video-caption similarity, higher is better",
  "Absolute relative depth error, lower is better",
  "Chamfer-L1 reconstruction distance, lower is better",
  "Relative rotation error, lower is better",
  "Relative rotation accuracy at 5 degrees, higher is better",
];

export function isBest(
  rows: (typeof benchmarks)[number]["rows"],
  column: number,
  value: string,
) {
  const values = rows.map((row) => Number(row.values[column]));
  return (
    Number(value) ===
    ([0, 1, 5].includes(column) ? Math.max(...values) : Math.min(...values))
  );
}
