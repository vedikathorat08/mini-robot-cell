import yaml from "js-yaml";

// cell.yaml is the single source of truth; nginx serves a copy at /config/cell.yaml.
export async function loadConfig() {
  const res = await fetch("/config/cell.yaml");
  if (!res.ok) throw new Error(`config HTTP ${res.status}`);
  return yaml.load(await res.text());
}
