(async ()=>{
  try{
    const res = await fetch('http://localhost:5173/src/LoginPage.tsx');
    console.log('STATUS', res.status, res.statusText);
    const text = await res.text();
    console.log('----BODY START----');
    console.log(text);
    console.log('----BODY END----');
  }catch(e){
    console.error('FETCH ERROR', e && e.stack ? e.stack : String(e));
    process.exitCode = 2;
  }
})();