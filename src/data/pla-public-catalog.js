// Public-source PLA formation and honor catalog loader. No automatic combat overrides.
export async function loadPlaPublicCatalog(basePath = './data/pla/') {
  const files = ['formations.json', 'navy-ships.json', 'honors.json', 'schema.json'];
  const entries = await Promise.all(files.map(async file => {
    const response = await fetch(basePath + file);
    if (!response.ok) throw new Error(`PLA catalog ${file}: HTTP ${response.status}`);
    return [file.replace('.json',''), await response.json()];
  }));
  return Object.fromEntries(entries);
}
export function applyHonorElite(unit, honor) {
  if (!unit || !honor || honor.elite !== true || honor.sourceStatus !== 'public_verified') return unit;
  return { ...unit, honorName: honor.name, elite: true, eliteTier: honor.eliteTier, honorId: honor.id };
}
