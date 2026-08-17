import { useState } from 'react';
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
  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] relative overflow-hidden font-sans">
      
      {/* Dynamic Background Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-30 pointer-events-none" 
           style={{ background: 'radial-gradient(ellipse at top, var(--accent) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      
      {/* Navigation Bar */}
      <header className="relative z-10 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)]/80 backdrop-blur-md sticky top-0">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <ScholarCoreLogo size="md" withText className="text-[color:var(--text-primary)]" />
          <div className="flex items-center gap-4">
            <button
              onClick={onSignIn}
              className="px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] rounded-[var(--radius-sm)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-all duration-300 cursor-pointer"
            >
              Sign in
            </button>
            <button
              onClick={onGetStarted}
              className="px-5 py-2 text-sm font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-full hover:bg-[color:var(--accent-hover)] hover:scale-105 hover:shadow-[0_0_15px_var(--accent)] transition-all duration-300 cursor-pointer"
            >
              Get started
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="pt-24 pb-20 md:pt-32 md:pb-28 px-6 text-center">
          <div className="mx-auto max-w-4xl animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]/50 backdrop-blur-sm text-sm text-[color:var(--text-secondary)] mb-8 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[color:var(--state-success)] animate-pulse" />
              Agentic Workflows Now Available
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
              Your AI-Powered <br className="hidden md:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--state-warning)]">
                Academic Research Engine
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-[color:var(--text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed font-light">
              Scholar Core bridges the gap between raw data and published manuscripts. 
              Organize knowledge, ensure 100% citation provenance, and write with agentic precision.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={onGetStarted}
                className="w-full sm:w-auto px-8 py-4 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] font-semibold rounded-full hover:bg-[color:var(--accent-hover)] hover:scale-105 hover:shadow-[0_0_20px_var(--accent)] transition-all duration-300 cursor-pointer text-lg flex items-center justify-center gap-2"
              >
                Start Researching Free
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
              <button
                onClick={onSignIn}
                className="w-full sm:w-auto px-8 py-4 border border-[color:var(--border-control)] text-[color:var(--text-primary)] font-medium rounded-full hover:bg-[color:var(--surface-hover)] transition-all duration-300 cursor-pointer text-lg"
              >
                Sign In
              </button>
            </div>
            
            <p className="mt-6 text-sm text-[color:var(--text-muted)]">No credit card required. 100% data provenance guaranteed.</p>
          </div>
        </section>

        {/* Workflow Showcase */}
        <section className="py-24 px-6 relative">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-16 text-center">The Agentic Research Pipeline</h2>
            
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { step: "01", title: "Define", desc: "Set your research objectives and constraints. The agent aligns to your goal." },
                { step: "02", title: "Collect", desc: "AI fetches and parses relevant academic sources into your secure Vault." },
                { step: "03", title: "Review", desc: "You maintain total control. Approve or reject every single piece of evidence." },
                { step: "04", title: "Synthesize", desc: "Generate compliant manuscripts mapped perfectly to journal requirements." }
              ].map((item, i) => (
                <div key={i} className="relative group p-6 rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:border-[color:var(--accent)] transition-colors duration-300 hover:shadow-lg hover:-translate-y-1">
                  <div className="text-5xl font-black text-[color:var(--surface-sunken)] absolute top-4 right-4 z-0 group-hover:text-[color:var(--accent-subtle)] transition-colors">
                    {item.step}
                  </div>
                  <div className="relative z-10">
                    <h3 className="text-xl font-bold mb-3 mt-6">{item.title}</h3>
                    <p className="text-[color:var(--text-secondary)] leading-relaxed text-sm">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Grid (Glassmorphism) */}
        <section className="py-24 px-6 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]">
          <div className="mx-auto max-w-6xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-6">Designed for Integrity. Built for Speed.</h2>
                <p className="text-lg text-[color:var(--text-secondary)] mb-8 leading-relaxed">
                  Scholar Core is not just a text generator. It is a strict enforcement engine that ensures every claim in your manuscript is backed by verified, human-approved evidence.
                </p>
                <ul className="space-y-6">
                  {[
                    { title: "Knowledge Vault", desc: "A unified, searchable library of your PDFs and sources." },
                    { title: "Citation Integrity", desc: "Zero hallucination guarantee. If it's not in the vault, it's not in the paper." },
                    { title: "Journal Compliance", desc: "Automated checks against specific journal word limits and structuring." }
                  ].map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-4">
                      <div className="mt-1 w-6 h-6 rounded-full bg-[color:var(--accent-subtle)] flex items-center justify-center flex-shrink-0 border border-[color:var(--accent-border)]">
                        <svg className="w-3.5 h-3.5 text-[color:var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                        <h4 className="font-semibold text-lg">{feature.title}</h4>
                        <p className="text-[color:var(--text-secondary)] text-sm">{feature.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Abstract UI Mockup */}
              <div className="relative h-[500px] w-full rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] shadow-2xl overflow-hidden p-6 flex flex-col gap-4">
                 <div className="absolute top-0 right-0 w-64 h-64 bg-[color:var(--accent)] opacity-10 blur-[60px] rounded-full mix-blend-screen" />
                 
                 {/* Mock UI Elements */}
                 <div className="w-full h-12 rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] flex items-center px-4 animate-pulse">
                   <div className="w-4 h-4 rounded-full bg-[color:var(--state-success)] mr-3" />
                   <div className="w-1/3 h-4 rounded bg-[color:var(--surface-sunken)]" />
                 </div>
                 
                 <div className="flex gap-4 flex-1">
                   <div className="w-1/3 h-full rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] p-4 flex flex-col gap-3">
                     <div className="w-full h-3 rounded bg-[color:var(--surface-sunken)]" />
                     <div className="w-5/6 h-3 rounded bg-[color:var(--surface-sunken)]" />
                     <div className="w-4/6 h-3 rounded bg-[color:var(--surface-sunken)]" />
                   </div>
                   <div className="flex-1 h-full rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] p-6 relative overflow-hidden">
                      <div className="w-3/4 h-6 rounded bg-[color:var(--text-primary)] opacity-10 mb-6" />
                      <div className="space-y-4">
                        <div className="w-full h-4 rounded bg-[color:var(--text-secondary)] opacity-10" />
                        <div className="w-full h-4 rounded bg-[color:var(--text-secondary)] opacity-10" />
                        <div className="w-5/6 h-4 rounded bg-[color:var(--text-secondary)] opacity-10" />
                        <div className="w-full h-4 rounded bg-[color:var(--text-secondary)] opacity-10" />
                      </div>
                      <div className="absolute bottom-6 right-6 px-4 py-2 rounded-full bg-[color:var(--state-success-subtle)] border border-[color:var(--state-success)] text-[color:var(--state-success)] text-xs font-bold shadow-sm">
                        100% Provenance
                      </div>
                   </div>
                 </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 px-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[color:var(--accent-subtle)] opacity-30 pointer-events-none" />
          <div className="mx-auto max-w-3xl text-center relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Ready to elevate your research?</h2>
            <p className="text-xl text-[color:var(--text-secondary)] mb-10">
              Join researchers organizing their knowledge and accelerating publication with Scholar Core.
            </p>
            <button
              onClick={onGetStarted}
              className="px-10 py-5 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] font-bold rounded-full hover:bg-[color:var(--accent-hover)] hover:scale-105 hover:shadow-[0_0_30px_var(--accent)] transition-all duration-300 cursor-pointer text-xl"
            >
              Start for Free
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[color:var(--border-subtle)] py-12 px-6 bg-[color:var(--surface-canvas)] relative z-10">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <ScholarCoreLogo size="sm" className="text-[color:var(--text-muted)]" />
            <span className="text-sm text-[color:var(--text-muted)] font-medium">
              © {new Date().getFullYear()} Scholar Core.
            </span>
          </div>
          <div className="flex gap-8 text-sm font-medium text-[color:var(--text-muted)]">
            <a href="#" className="hover:text-[color:var(--accent)] transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-[color:var(--accent)] transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-[color:var(--accent)] transition-colors">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
