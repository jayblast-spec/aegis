'use client'

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main style={{ minHeight:'100vh', display:'grid', placeItems:'center', background:'#0b0e12', color:'#edf0ec', fontFamily:'serif' }}><div><h1>The embassy needs a moment.</h1><button onClick={reset}>Try again</button></div></main> }
