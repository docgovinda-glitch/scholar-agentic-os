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
    <div className="min-h-screen bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] relative overflow-hidden font-sans selection:bg-[color:var(--accent-subtle)]">
      
      {/* Dynamic Background Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[color:var(--accent-subtle)] blur-[120px] rounded-full pointer-events-none animate-pulse-slow" />
      <div className="absolute top-[20%] right-[-10%] w-[40%] h-[60%] bg-[color:var(--accent-subtle)] blur-[150px] rounded-full pointer-events-none mix-blend-multiply dark:mix-blend-screen" />
      <div className="absolute bottom-[-10%] left-[20%] w-[60%] h-[40%] bg-[color:var(--state-info-subtle)] blur-[120px] rounded-full pointer-events-none" />

      {/* Navigation Bar */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[color:var(--surface-raised)]/90 backdrop-blur-xl border-b border-[color:var(--border-subtle)] shadow-md py-3' : 'bg-transparent py-6'}`}>
        <div className="mx-auto max-w-7xl px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[color:var(--accent)] shadow-sm group-hover:shadow-[color:var(--accent-subtle)] transition-all duration-300">
              <span className="text-[color:var(--text-inverse)] font-bold text-xl font-serif">S</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-[color:var(--text-primary)]">
              Scholar Core
            </span>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={onSignIn}
              className="text-sm font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--accent)] transition-colors duration-200 cursor-pointer"
            >
              Sign in
            </button>
            <button
              onClick={onGetStarted}
              className="px-6 py-2.5 rounded-full text-sm font-bold bg-[color:var(--accent)] text-[color:var(--text-inverse)] shadow-sm hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer"
            >
              Start Researching
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 pt-32 pb-16">
        {/* Hero Section */}
        <section className="relative px-6 lg:px-8 pt-20 pb-32 text-center max-w-6xl mx-auto flex flex-col items-center">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] shadow-sm mb-12">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[color:var(--state-info)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[color:var(--state-info)]"></span>
            </span>
            <span className="text-sm font-medium text-[color:var(--text-secondary)] tracking-wide uppercase">Agentic OS 2.0 Now Live</span>
          </div>

          <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-[1.1] text-[color:var(--text-primary)]">
            Research at the <br className="hidden md:block" />
            <span className="text-[color:var(--accent)]">
              Speed of Thought
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-[color:var(--text-secondary)] max-w-3xl mx-auto mb-14 leading-relaxed font-light">
            Scholar Core bridges the gap between raw data and published manuscripts. 
            Organize knowledge, ensure <strong className="text-[color:var(--text-primary)] font-medium">100% citation provenance</strong>, and write with agentic precision.
          </p>

          <div className="flex flex-col sm:flex-row gap-5 w-full sm:w-auto">
            <button
              onClick={onGetStarted}
              className="px-8 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] active:scale-[0.98] bg-[color:var(--accent)] text-[color:var(--text-inverse)] shadow-md hover:bg-[color:var(--accent-hover)]"
            >
              Get Started for Free
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
            <button
              onClick={onSignIn}
              className="px-8 py-4 rounded-2xl font-semibold text-lg text-[color:var(--text-primary)] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] hover:bg-[color:var(--surface-hover)] shadow-sm transition-all flex items-center justify-center"
            >
              Sign In to Workspace
            </button>
          </div>
          <p className="mt-8 text-sm text-[color:var(--text-muted)]">No credit card required. Join 10,000+ researchers globally.</p>
        </section>

        {/* Abstract UI Mockup Dashboard */}
        <section className="px-6 lg:px-8 -mt-10 relative z-20 pb-32">
          <div className="max-w-6xl mx-auto rounded-[2rem] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] shadow-lg overflow-hidden relative">
            <div className="absolute top-0 inset-x-0 h-1 bg-[color:var(--accent)]"></div>
            
            {/* Fake Browser Header */}
            <div className="h-14 border-b border-[color:var(--border-subtle)] flex items-center px-6 gap-2 bg-[color:var(--surface-inset)]">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-[color:var(--state-danger)] border border-[color:var(--state-danger-subtle)]"></div>
                <div className="w-3 h-3 rounded-full bg-[color:var(--state-warning)] border border-[color:var(--state-warning-subtle)]"></div>
                <div className="w-3 h-3 rounded-full bg-[color:var(--state-success)] border border-[color:var(--state-success-subtle)]"></div>
              </div>
              <div className="mx-auto px-32 py-1.5 rounded-md bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-xs text-[color:var(--text-muted)] font-mono">
                scholar.gkshah.com.np/workspace
              </div>
            </div>

            <div className="p-8 grid md:grid-cols-3 gap-8 bg-[color:var(--surface-canvas)]">
              {/* Sidebar Mock */}
              <div className="col-span-1 border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] rounded-2xl p-6 flex flex-col gap-6">
                <div className="w-full h-8 rounded-lg bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center px-4">
                  <div className="w-3 h-3 rounded-full bg-[color:var(--accent)] mr-3 animate-pulse"></div>
                  <div className="h-2 w-24 bg-[color:var(--accent)]/50 rounded-full"></div>
                </div>
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex gap-4 items-center">
                      <div className="w-8 h-8 rounded-lg bg-[color:var(--surface-sunken)]"></div>
                      <div className="space-y-2 flex-1">
                        <div className="h-2 w-full bg-[color:var(--surface-sunken)] rounded-full border border-[color:var(--border-subtle)]"></div>
                        <div className="h-2 w-2/3 bg-[color:var(--surface-inset)] rounded-full border border-[color:var(--border-subtle)]"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Main Content Mock */}
              <div className="col-span-2 border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] rounded-2xl p-8 relative overflow-hidden">
                <div className="flex items-center justify-between mb-8 relative z-10">
                  <div className="h-6 w-48 bg-[color:var(--surface-sunken)] rounded-md border border-[color:var(--border-subtle)]"></div>
                  <div className="h-8 w-24 bg-[color:var(--state-success-subtle)] border border-[color:var(--state-success)] rounded-full"></div>
                </div>
                
                <div className="space-y-6 relative z-10">
                  <div className="p-5 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-[color:var(--accent-subtle)] flex items-center justify-center border border-[color:var(--accent-border)]">
                         <svg className="w-5 h-5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      </div>
                      <div className="flex-1 space-y-3 pt-2">
                        <div className="h-3 w-5/6 bg-[color:var(--border-strong)] rounded-full"></div>
                        <div className="h-3 w-full bg-[color:var(--border-subtle)] rounded-full"></div>
                        <div className="h-3 w-4/6 bg-[color:var(--border-subtle)] rounded-full"></div>
                      </div>
                    </div>
                  </div>
                  <div className="p-5 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] opacity-60">
                    <div className="h-3 w-3/4 bg-[color:var(--border-strong)] rounded-full mb-3"></div>
                    <div className="h-3 w-1/2 bg-[color:var(--border-subtle)] rounded-full"></div>
                  </div>
                  <div className="p-5 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] opacity-40">
                    <div className="h-3 w-5/6 bg-[color:var(--border-strong)] rounded-full mb-3"></div>
                    <div className="h-3 w-2/3 bg-[color:var(--border-subtle)] rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Workflow Showcase */}
        <section className="py-24 px-6 relative border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
          <div className="mx-auto max-w-7xl">
            <div className="text-center mb-20">
              <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight text-[color:var(--text-primary)]">The Agentic Research Pipeline</h2>
              <p className="text-xl text-[color:var(--text-secondary)] max-w-2xl mx-auto">A continuous, integrated research environment where every step is handled by an agent.</p>
            </div>
            
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { step: "01", title: "Definition", desc: "Set your research objectives and constraints. The agent aligns to your goal." },
                { step: "02", title: "Extraction", desc: "Data Miner AI fetches and parses relevant academic sources into your secure Vault." },
                { step: "03", title: "Synthesis", desc: "Cross-reference vault evidence with external literature to build a theoretical framework." },
                { step: "04", title: "Review", desc: "Generate compliant manuscripts mapped perfectly to journal requirements." }
              ].map((item, i) => (
                <div key={i} className="group relative p-8 rounded-[2rem] border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] hover:bg-[color:var(--surface-hover)] transition-all duration-300 overflow-hidden hover:-translate-y-2 hover:shadow-lg">
                  <div className="absolute top-0 left-0 w-full h-1 bg-[color:var(--accent)] opacity-50 group-hover:opacity-100 transition-opacity"></div>
                  <div className="text-7xl font-black text-[color:var(--surface-inset)] absolute -top-4 -right-2 z-0 transition-colors duration-300 pointer-events-none">
                    {item.step}
                  </div>
                  <div className="relative z-10 mt-8">
                    <div className="w-12 h-12 rounded-xl mb-6 bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center shadow-sm">
                       <span className="text-[color:var(--accent)] font-bold text-xl">{i+1}</span>
                    </div>
                    <h3 className="text-2xl font-bold mb-4 text-[color:var(--text-primary)]">{item.title}</h3>
                    <p className="text-[color:var(--text-secondary)] leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="py-32 px-6 relative bg-[color:var(--surface-canvas)]">
          <div className="mx-auto max-w-7xl">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-4xl md:text-5xl font-bold mb-8 leading-tight tracking-tight text-[color:var(--text-primary)]">Designed for Integrity.<br/>Built for Speed.</h2>
                <p className="text-xl text-[color:var(--text-secondary)] mb-12 leading-relaxed">
                  Scholar Core is not just a text generator. It is a strict enforcement engine that ensures every claim in your manuscript is backed by verified, human-approved evidence.
                </p>
                <div className="space-y-8">
                  {[
                    { title: "Knowledge Vault", desc: "A unified, searchable library of your PDFs and sources. Upload once, query forever.", icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" },
                    { title: "Citation Integrity", desc: "Zero hallucination guarantee. If it's not in the vault, it's not in the paper.", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
                    { title: "Journal Compliance", desc: "Automated checks against specific journal word limits, formatting, and structuring.", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }
                  ].map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-5 group">
                      <div className="mt-1 w-12 h-12 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] flex items-center justify-center flex-shrink-0 group-hover:bg-[color:var(--accent-subtle)] group-hover:border-[color:var(--accent-border)] transition-colors shadow-sm">
                        <svg className="w-6 h-6 text-[color:var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={feature.icon} /></svg>
                      </div>
                      <div>
                        <h4 className="font-bold text-xl mb-2 text-[color:var(--text-primary)] group-hover:text-[color:var(--accent)] transition-colors">{feature.title}</h4>
                        <p className="text-[color:var(--text-secondary)] leading-relaxed">{feature.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Dynamic UI visual */}
              <div className="relative aspect-square w-full rounded-[3rem] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-2 shadow-sm">
                 <div className="absolute inset-0 bg-[color:var(--surface-inset)] rounded-[2.5rem] overflow-hidden relative flex flex-col">
                   {/* App Window Header */}
                   <div className="h-12 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] flex items-center px-6">
                      <div className="text-xs font-mono text-[color:var(--text-muted)]">Evidence Matrix</div>
                   </div>
                   {/* Content */}
                   <div className="p-6 flex-1 flex flex-col gap-4 bg-[color:var(--surface-canvas)]">
                     <div className="flex gap-4 items-center mb-4">
                       <div className="w-10 h-10 rounded-full bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)]">
                         <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                       </div>
                       <div className="h-6 w-1/3 bg-[color:var(--border-strong)] rounded-md"></div>
                     </div>
                     {[
                       { w: "w-full", c: "bg-[color:var(--state-success-subtle)] border-[color:var(--state-success)]" },
                       { w: "w-11/12", c: "bg-[color:var(--state-info-subtle)] border-[color:var(--state-info)]" },
                       { w: "w-4/5", c: "bg-[color:var(--state-warning-subtle)] border-[color:var(--state-warning)]" },
                       { w: "w-full", c: "bg-[color:var(--surface-sunken)] border-[color:var(--border-strong)]" },
                       { w: "w-[95%]", c: "bg-[color:var(--surface-inset)] border-[color:var(--border-subtle)] opacity-50" },
                     ].map((bar, i) => (
                       <div key={i} className={`h-16 ${bar.w} ${bar.c} border rounded-xl p-4 flex items-center justify-between relative overflow-hidden group`}>
                         <div className="h-3 w-1/2 bg-[color:var(--surface-raised)] rounded-full mix-blend-overlay"></div>
                         <div className="h-6 w-20 bg-[color:var(--surface-raised)] rounded-full mix-blend-overlay"></div>
                       </div>
                     ))}
                   </div>
                 </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-32 px-6 relative text-center bg-[color:var(--surface-raised)] border-t border-[color:var(--border-subtle)]">
          <div className="mx-auto max-w-4xl relative z-10">
            <h2 className="text-5xl md:text-7xl font-black mb-8 tracking-tighter text-[color:var(--text-primary)]">
              Ready to elevate <br/> your research?
            </h2>
            <p className="text-2xl text-[color:var(--text-secondary)] mb-12 font-light max-w-2xl mx-auto">
              Join thousands of researchers organizing their knowledge and accelerating publication with Scholar Core.
            </p>
            <button
              onClick={onGetStarted}
              className="px-10 py-5 rounded-full text-xl font-bold bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] transition-all hover:scale-105 hover:shadow-lg flex items-center justify-center gap-3 mx-auto shadow-sm"
            >
              Start for Free
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[color:var(--border-subtle)] py-12 px-6 bg-[color:var(--surface-canvas)] relative z-10">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-sm flex items-center justify-center">
              <span className="text-[color:var(--accent)] font-bold font-serif text-sm">S</span>
            </div>
            <span className="text-sm text-[color:var(--text-muted)] font-medium">
              © {new Date().getFullYear()} Scholar Core. All rights reserved.
            </span>
          </div>
          <div className="flex gap-8 text-sm font-medium text-[color:var(--text-muted)]">
            <a href="#" className="hover:text-[color:var(--text-primary)] transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-[color:var(--text-primary)] transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-[color:var(--text-primary)] transition-colors">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
