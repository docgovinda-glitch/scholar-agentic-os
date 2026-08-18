import { useState, useEffect } from 'react';
import ScholarCoreLogo from '../components/ScholarCoreLogo';
import { useNavigate } from 'react-router-dom';

interface ScholarCoreLandingProps {
  onGetStarted?: () => void;
  onSignIn?: () => void;
}

export default function ScholarCoreLanding({
  onGetStarted,
  onSignIn,
}: ScholarCoreLandingProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden font-sans selection:bg-indigo-500/30">
      
      {/* Dynamic Background Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none animate-pulse-slow" />
      <div className="absolute top-[20%] right-[-10%] w-[40%] h-[60%] bg-purple-600/10 blur-[150px] rounded-full pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-[-10%] left-[20%] w-[60%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSkiLz48L3N2Zz4=')] opacity-50 pointer-events-none" />

      {/* Navigation Bar */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-black/60 backdrop-blur-xl border-b border-white/10 shadow-2xl shadow-black/50 py-3' : 'bg-transparent py-6'}`}>
        <div className="mx-auto max-w-7xl px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg group-hover:shadow-indigo-500/25 transition-all duration-300">
              <span className="text-white font-bold text-xl font-serif">S</span>
              <div className="absolute inset-0 rounded-xl ring-1 ring-white/20"></div>
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              Scholar Core
            </span>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={onSignIn}
              className="text-sm font-semibold text-white/70 hover:text-white transition-colors duration-200 cursor-pointer"
            >
              Sign in
            </button>
            <button
              onClick={onGetStarted}
              className="relative group px-6 py-2.5 rounded-full text-sm font-bold overflow-hidden cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-90 group-hover:opacity-100 transition-opacity bg-[length:200%_auto] animate-gradient-x"></div>
              <div className="absolute inset-0 rounded-full ring-1 ring-white/20 shadow-[0_0_20px_rgba(99,102,241,0.4)] group-hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] transition-all"></div>
              <span className="relative text-white">Start Researching</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 pt-32 pb-16">
        {/* Hero Section */}
        <section className="relative px-6 lg:px-8 pt-20 pb-32 text-center max-w-6xl mx-auto flex flex-col items-center">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md mb-12 shadow-2xl">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
            </span>
            <span className="text-sm font-medium text-white/80 tracking-wide uppercase">Agentic OS 2.0 Now Live</span>
          </div>

          <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-[1.1] text-transparent bg-clip-text bg-gradient-to-b from-white via-white/90 to-white/50 drop-shadow-sm">
            Research at the <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-blue-400">
              Speed of Thought
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-white/60 max-w-3xl mx-auto mb-14 leading-relaxed font-light">
            Scholar Core bridges the gap between raw data and published manuscripts. 
            Organize knowledge, ensure <strong className="text-white/90 font-medium">100% citation provenance</strong>, and write with agentic precision.
          </p>

          <div className="flex flex-col sm:flex-row gap-5 w-full sm:w-auto">
            <button
              onClick={onGetStarted}
              className="group relative px-8 py-4 rounded-2xl font-bold text-lg overflow-hidden flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-white text-black transition-colors"></div>
              <span className="relative text-black group-hover:text-black/80">Get Started for Free</span>
              <svg className="w-5 h-5 relative text-black transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
            <button
              onClick={onSignIn}
              className="px-8 py-4 rounded-2xl font-semibold text-lg text-white/80 border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white backdrop-blur-md transition-all flex items-center justify-center"
            >
              Sign In to Workspace
            </button>
          </div>
          <p className="mt-8 text-sm text-white/40">No credit card required. Join 10,000+ researchers globally.</p>
        </section>

        {/* Abstract UI Mockup Dashboard */}
        <section className="px-6 lg:px-8 -mt-10 relative z-20 pb-32">
          <div className="max-w-6xl mx-auto rounded-[2rem] border border-white/10 bg-[#0A0A0A]/80 backdrop-blur-2xl shadow-[0_0_80px_rgba(0,0,0,0.8)] overflow-hidden relative">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
            
            {/* Fake Browser Header */}
            <div className="h-14 border-b border-white/5 flex items-center px-6 gap-2 bg-white/[0.02]">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
              </div>
              <div className="mx-auto px-32 py-1.5 rounded-md bg-white/5 border border-white/5 text-xs text-white/30 font-mono">
                scholar.gkshah.com.np/workspace
              </div>
            </div>

            <div className="p-8 grid md:grid-cols-3 gap-8">
              {/* Sidebar Mock */}
              <div className="col-span-1 border border-white/5 bg-white/[0.02] rounded-2xl p-6 flex flex-col gap-6">
                <div className="w-full h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center px-4">
                  <div className="w-3 h-3 rounded-full bg-indigo-400 mr-3 animate-pulse"></div>
                  <div className="h-2 w-24 bg-indigo-400/50 rounded-full"></div>
                </div>
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex gap-4 items-center">
                      <div className="w-8 h-8 rounded-lg bg-white/5"></div>
                      <div className="space-y-2 flex-1">
                        <div className="h-2 w-full bg-white/10 rounded-full"></div>
                        <div className="h-2 w-2/3 bg-white/5 rounded-full"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Main Content Mock */}
              <div className="col-span-2 border border-white/5 bg-white/[0.03] rounded-2xl p-8 relative overflow-hidden">
                <div className="absolute -top-32 -right-32 w-64 h-64 bg-purple-500/20 blur-[80px] rounded-full"></div>
                <div className="flex items-center justify-between mb-8 relative z-10">
                  <div className="h-6 w-48 bg-white/20 rounded-md"></div>
                  <div className="h-8 w-24 bg-green-500/20 border border-green-500/30 rounded-full"></div>
                </div>
                
                <div className="space-y-6 relative z-10">
                  <div className="p-5 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-1">
                        <div className="w-full h-full bg-black rounded-full flex items-center justify-center">
                           <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                      </div>
                      <div className="flex-1 space-y-3 pt-2">
                        <div className="h-3 w-5/6 bg-white/20 rounded-full"></div>
                        <div className="h-3 w-full bg-white/20 rounded-full"></div>
                        <div className="h-3 w-4/6 bg-white/20 rounded-full"></div>
                      </div>
                    </div>
                  </div>
                  <div className="p-5 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md opacity-50">
                    <div className="h-3 w-3/4 bg-white/10 rounded-full mb-3"></div>
                    <div className="h-3 w-1/2 bg-white/10 rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Workflow Showcase */}
        <section className="py-24 px-6 relative border-t border-white/5 bg-white/[0.01]">
          <div className="mx-auto max-w-7xl">
            <div className="text-center mb-20">
              <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">The Agentic Research Pipeline</h2>
              <p className="text-xl text-white/50 max-w-2xl mx-auto">A continuous, integrated research environment where every step is handled by an agent.</p>
            </div>
            
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { step: "01", title: "Definition", desc: "Set your research objectives and constraints. The agent aligns to your goal.", color: "from-blue-500 to-cyan-400" },
                { step: "02", title: "Extraction", desc: "Data Miner AI fetches and parses relevant academic sources into your secure Vault.", color: "from-indigo-500 to-purple-500" },
                { step: "03", title: "Synthesis", desc: "Cross-reference vault evidence with external literature to build a theoretical framework.", color: "from-purple-500 to-pink-500" },
                { step: "04", title: "Review", desc: "Generate compliant manuscripts mapped perfectly to journal requirements.", color: "from-emerald-400 to-teal-500" }
              ].map((item, i) => (
                <div key={i} className="group relative p-8 rounded-[2rem] border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-500 overflow-hidden hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] hover:border-white/20">
                  <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${item.color} opacity-50 group-hover:opacity-100 transition-opacity`}></div>
                  <div className="text-7xl font-black text-white/5 absolute -top-4 -right-2 z-0 group-hover:text-white/10 transition-colors duration-500 pointer-events-none">
                    {item.step}
                  </div>
                  <div className="relative z-10 mt-8">
                    <div className={`w-12 h-12 rounded-xl mb-6 bg-gradient-to-br ${item.color} flex items-center justify-center bg-opacity-20 shadow-lg`}>
                       <span className="text-white font-bold text-xl">{i+1}</span>
                    </div>
                    <h3 className="text-2xl font-bold mb-4 text-white/90">{item.title}</h3>
                    <p className="text-white/50 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Grid (Glassmorphism) */}
        <section className="py-32 px-6 relative">
          <div className="mx-auto max-w-7xl">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-4xl md:text-5xl font-bold mb-8 leading-tight tracking-tight">Designed for Integrity.<br/>Built for Speed.</h2>
                <p className="text-xl text-white/60 mb-12 leading-relaxed">
                  Scholar Core is not just a text generator. It is a strict enforcement engine that ensures every claim in your manuscript is backed by verified, human-approved evidence.
                </p>
                <div className="space-y-8">
                  {[
                    { title: "Knowledge Vault", desc: "A unified, searchable library of your PDFs and sources. Upload once, query forever.", icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" },
                    { title: "Citation Integrity", desc: "Zero hallucination guarantee. If it's not in the vault, it's not in the paper.", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
                    { title: "Journal Compliance", desc: "Automated checks against specific journal word limits, formatting, and structuring.", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }
                  ].map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-5 group">
                      <div className="mt-1 w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-500/20 group-hover:border-indigo-500/50 transition-colors">
                        <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={feature.icon} /></svg>
                      </div>
                      <div>
                        <h4 className="font-bold text-xl mb-2 text-white/90 group-hover:text-white transition-colors">{feature.title}</h4>
                        <p className="text-white/50 leading-relaxed">{feature.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Dynamic UI visual */}
              <div className="relative aspect-square w-full rounded-[3rem] border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-2">
                 <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent opacity-50 blur-2xl"></div>
                 <div className="w-full h-full rounded-[2.5rem] bg-[#0a0a0a] border border-white/10 overflow-hidden relative shadow-2xl flex flex-col">
                   {/* App Window Header */}
                   <div className="h-12 border-b border-white/5 bg-white/[0.02] flex items-center px-6">
                      <div className="text-xs font-mono text-white/40">Evidence Matrix</div>
                   </div>
                   {/* Content */}
                   <div className="p-6 flex-1 flex flex-col gap-4">
                     <div className="flex gap-4 items-center mb-4">
                       <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                         <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                       </div>
                       <div className="h-6 w-1/3 bg-white/10 rounded-md"></div>
                     </div>
                     {[
                       { w: "w-full", c: "bg-green-500/10 border-green-500/20" },
                       { w: "w-11/12", c: "bg-blue-500/10 border-blue-500/20" },
                       { w: "w-4/5", c: "bg-purple-500/10 border-purple-500/20" },
                     ].map((bar, i) => (
                       <div key={i} className={`h-16 ${bar.w} ${bar.c} border rounded-xl p-4 flex items-center justify-between relative overflow-hidden group`}>
                         <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                         <div className="h-3 w-1/2 bg-white/20 rounded-full"></div>
                         <div className="h-6 w-20 bg-white/10 rounded-full"></div>
                       </div>
                     ))}
                   </div>
                 </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-32 px-6 relative text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-[#050505] to-[#050505] opacity-50 pointer-events-none" />
          <div className="mx-auto max-w-4xl relative z-10">
            <h2 className="text-5xl md:text-7xl font-black mb-8 tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
              Ready to elevate <br/> your research?
            </h2>
            <p className="text-2xl text-white/50 mb-12 font-light max-w-2xl mx-auto">
              Join thousands of researchers organizing their knowledge and accelerating publication with Scholar Core.
            </p>
            <button
              onClick={onGetStarted}
              className="group relative px-10 py-5 rounded-full text-xl font-bold overflow-hidden transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(99,102,241,0.6)]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 transition-opacity bg-[length:200%_auto] animate-gradient-x"></div>
              <span className="relative text-white flex items-center justify-center gap-3">
                Start for Free
                <svg className="w-6 h-6 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </span>
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-6 bg-black relative z-10">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold font-serif text-sm">S</span>
            </div>
            <span className="text-sm text-white/50 font-medium">
              © {new Date().getFullYear()} Scholar Core. All rights reserved.
            </span>
          </div>
          <div className="flex gap-8 text-sm font-medium text-white/40">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
