import { getCatchMeasurementLabels } from "../data/catchWeight.js";
import "./CatchMeasurements.css";

export default function CatchMeasurements({ record, size = "regular", lengthNote, weightNote }) {
  const { length, weight, estimated } = getCatchMeasurementLabels(record);
  if (length === null && weight === null) return null;

  return <span className={`catch-measures catch-measures--${size}`}>
    {length !== null && <span className="catch-measure">
      <strong className="catch-measures-primary">{length}</strong>
      {lengthNote}
    </span>}
    {weight !== null && <span className="catch-measure">
      {length === null
        ? <strong className="catch-measures-primary">{weight}</strong>
        : <span className="catch-measures-secondary">{weight}</span>}
      {estimated && <small className="catch-measures-estimate">odhad</small>}
      {weightNote}
    </span>}
  </span>;
}
