// React's development profiler can receive negative server/client timing offsets.
// Correct only that known NotFound profiler entry; never hide application errors.
export function installDevelopmentPerformanceGuard(target:Pick<Performance,"measure">){
 const original=target.measure;
 target.measure=function(...args:Parameters<Performance["measure"]>){
  const [name,options]=args;
  if(name.replace(/^\u200b/,"")==="NotFound"&&typeof options==="object"&&options!==null&&options.detail?.devtools&&((typeof options.start==="number"&&options.start<0)||(typeof options.end==="number"&&options.end<0))){
   const start=typeof options.start==="number"?Math.max(0,options.start):options.start;
   const end=typeof options.end==="number"?Math.max(typeof start==="number"?start:0,options.end):options.end;
   args[1]={...options,start,end};
  }
  return Reflect.apply(original,target,args) as PerformanceMeasure;
 };
 return ()=>{target.measure=original;};
}
