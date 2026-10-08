const RAD2DEG = 180 / Math.PI;

export default function JointSliders({ joints, targets, actual, disabled, onChange }) {
  return (
    <div className="sliders">
      {joints.map((j) => {
        const target = targets[j.name] ?? 0;
        const reported = actual?.[j.name];
        return (
          <label key={j.name} className="slider-row">
            <span className="joint-name">{j.name}</span>
            <input
              type="range"
              min={j.lower}
              max={j.upper}
              step="0.001"
              value={target}
              disabled={disabled}
              onChange={(e) => onChange(j.name, parseFloat(e.target.value))}
            />
            <span className="readout">
              {(target * RAD2DEG).toFixed(1)}° / {target.toFixed(3)} rad
            </span>
            <span className="actual">
              state: {reported === undefined ? "–" : reported.toFixed(3)} rad
            </span>
          </label>
        );
      })}
    </div>
  );
}
