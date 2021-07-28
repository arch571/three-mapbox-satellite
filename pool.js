//dead simple promise pool - no type checks or validations or errors
//concept taken from @supercharge/promise-pool and @ricokahler/pool

const promisePool = async (collection, maxConcurrency, task)=>{
  if(maxConcurrency == 0) maxConcurrency = collection.length;
  const ci = collection.map((d,i)=>[d,i]);
  const result = new Array(collection.length);
  const data = ci.slice(0, maxConcurrency);
  let nextElem = data.length;
  const doTask = async ([d,i])=>{
    result[i] = await task(d,i);
    if(nextElem < ci.length) 
      return doTask(ci[nextElem++]);
    return true;
  }
  await Promise.all(data.map(d=>doTask(d)));
  return result;
}

export default promisePool
