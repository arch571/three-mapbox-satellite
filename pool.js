//dead simple promise pool - no type checks or validations or errors
//idea taken from @supercharge/promise-pool concept and @ricokahler/pool

const promisePool = async (collection, max_concurrency, task)=>{
  if(max_concurrency == 0) max_concurrency = collection.length;
  const ci = collection.map((d,i)=>[d,i]);
  const result = new Array(collection.length);
  const data = ci.slice(0, max_concurrency);
  let next_elem = data.length;
  const doTask = async ([d,i])=>{
    result[i] = await task(d);
    if(next_elem < ci.length) 
      return doTask(ci[next_elem++]);
    return true;
  }
  await Promise.all(data.map(d=>doTask(d)));
  return result;
}

export default promisePool
