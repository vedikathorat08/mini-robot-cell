import yaml from "js-yaml";

export async function loadConfig() {
  const res = await fetch("/config/cell.yaml");
  if (!res.ok) throw new Error(`config HTTP ${res.status}`);
  return yaml.load(await res.text());
}