// Read-only statistics of explicitly approved values, never a private diary total.
export function publicFishingStats(legacy,publications,{partial=false}={}) {
  const records=new Map(legacy.map(r=>[r.id,r]));
  publications.forEach(r=>{const {sourceId,...safe}=r;records.set(sourceId,safe);});
  const rows=[...records.values()].filter(r=>typeof r.species === "string" && r.species.trim());
  const identified=rows.filter(r=>!/neurčen|neznám|unknown/i.test(r.species));
  const counts=new Map();
  identified.forEach(r=>counts.set(r.species,(counts.get(r.species)??0)+1));
  const finite=(value,max)=>Number.isFinite(value)&&value>0&&value<=max;
  const stats={version:1,source:"shared",partial,catchCount:rows.length,speciesCount:counts.size,
    longestCm:Math.max(0,...identified.filter(r=>finite(r.lengthCm,500)).map(r=>r.lengthCm))||null,
    heaviestKg:Math.max(0,...identified.filter(r=>finite(r.weightKg,500)).map(r=>r.weightKg))||null,
    speciesCounts:[...counts].map(([species,count])=>({species,count})).sort((a,b)=>b.count-a.count||a.species.localeCompare(b.species,"cs"))};
  const trophies=identified.filter(r=>finite(r.lengthCm,500)||finite(r.weightKg,500)).sort((a,b)=>(b.lengthCm??0)-(a.lengthCm??0)||(b.weightKg??0)-(a.weightKg??0)).slice(0,3)
    .map(r=>({id:r.id,species:r.species,...(finite(r.lengthCm,500)?{lengthCm:r.lengthCm}:{}),...(finite(r.weightKg,500)?{weightKg:r.weightKg}:{}),...(r.caughtAt?{caughtAt:r.caughtAt}:{})}));
  return {statistics:stats,trophies};
}
