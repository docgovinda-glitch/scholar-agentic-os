/**
 * SCHOLAR CORE landing page — the front door for unauthenticated users.
 *
 * Explains what Scholar Core is, how it works, and what it offers.
 * Acts as a "soft entry" — users can explore before signing in, or go
 * straight to Sign In / Register.
 *
 * This is the unauthenticated homepage. Authenticated users see
 * ProjectListScreen instead (their command center).
 */

import { useState } from 'react';
import ScholarCoreLogo from '../components/ScholarCoreLogo';

interface ScholarCoreLandingProps {
  onGetStarted?: () => void;
  onSignIn?: () => void;
}

export default function ScholarCoreLanding({
  onGetStarted,
  onSignIn,
}: ScholarCoreLandingProps) {
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  return (
    <div className="bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]">
      {/* Navigation Bar */}
      <header className="border-b border-[color:var(--border-subtle)]">
        <div className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between">
          <ScholarCoreLogo size="md" withText className="text-[color:var(--text-primary)]" />
          <div className="flex items-center gap-3">
            <button
              onClick={onSignIn}
              className="px-3 py-1.5 text-sm text-[color:var(--text-secondary)] rounded-[var(--radius-sm)] hover:bg-[color:var(--surface-hover)] transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={onGetStarted}
              className="px-4 py-1.5 text-sm font-medium bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-sm)] hover:bg-[color:var(--accent-hover)] transition-colors"
            >
              Get started
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="py-16 md:py-24 px-5">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 flex justify-center">
              <ScholarCoreLogo size="lg" className="text-[color:var(--accent)]" />
            </div>

            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              SCHOLAR CORE
            </h1>

            <p className="text-lg md:text-xl text-[color:var(--text-secondary)] mb-2">
              AI Research & Knowledge Platform
            </p>

            <p className="text-xl md:text-2xl font-medium text-[color:var(--accent)] mb-8">
              Your Research Command Center
            </p>

            <p className="text-base text-[color:var(--text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed">
              Research, organize knowledge, work with sources, and create scholarly and professional documents in one
              connected workspace. Scholar Core brings together AI assistance, knowledge management, and document
              creation — so you can focus on what matters: your research and ideas.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={onGetStarted}
                className="px-6 py-3 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] font-medium rounded-[var(--radius-md)] hover:bg-[color:var(--accent-hover)] transition-colors"
              >
                Get Started Free
              </button>
              <button
                onClick={onSignIn}
                className="px-6 py-3 border border-[color:var(--border-default)] text-[color:var(--text-primary)] font-medium rounded-[var(--radius-md)] hover:bg-[color:var(--surface-hover)] transition-colors"
              >
                Sign In
              </button>
            </div>
          </div>
        </section>

        {/* What is Scholar Core Section */}
        <section className="py-16 md:py-20 px-5 border-t border-[color:var(--border-subtle)]">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">What is Scholar Core?</h2>
            <p className="text-base text-[color:var(--text-secondary)] mb-6 leading-relaxed">
              Scholar Core connects research, knowledge, and creation in one workspace. It's not another chatbot — it's
              a research platform that understands your workflow.
            </p>

            <div className="grid md:grid-cols-3 gap-6 mt-10">
              {[
                {
                  icon: '📚',
                  title: 'Knowledge Vault',
                  desc: 'Store, organize, and access research materials, sources, and notes across all your projects.',
                },
                {
                  icon: '🔍',
                  title: 'Research Tools',
                  desc: 'Work with sources, citations, and structured research workflows. Organize your thinking as you go.',
                },
                {
                  icon: '✍️',
                  title: 'Document Creation',
                  desc: 'Create theses, essays, articles, proposals, and professional documents with built-in structure.',
                },
                {
                  icon: '🧠',
                  title: 'AI Assistance',
                  desc: 'Use AI to analyze, compare, summarize, and understand information. Always on your terms.',
                },
                {
                  icon: '🔗',
                  title: 'Connected Workflow',
                  desc: 'Move seamlessly from research to knowledge to creation. Everything you need, in one place.',
                },
                {
                  icon: '⚙️',
                  title: 'Your Choice',
                  desc: 'Use Scholar\'s AI, bring your own models, or use local runners. Full control, always.',
                },
              ].map((feature, i) => (
                <div key={i} className="p-4 rounded-[var(--radius-md)] bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)]">
                  <div className="text-3xl mb-2">{feature.icon}</div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-[color:var(--text-secondary)]">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-16 md:py-20 px-5 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-bold mb-12 text-center">How Scholar Core Works</h2>

            <div className="space-y-6">
              {[
                {
                  num: '1',
                  title: 'Ask',
                  desc: 'Start with a research question, task, idea, or problem.',
                },
                {
                  num: '2',
                  title: 'Research',
                  desc: 'Find, examine, and organize relevant information and sources.',
                },
                {
                  num: '3',
                  title: 'Understand',
                  desc: 'Use AI to analyze, compare, summarize, and connect information.',
                },
                {
                  num: '4',
                  title: 'Organize',
                  desc: 'Store useful knowledge, sources, notes, and research material.',
                },
                {
                  num: '5',
                  title: 'Create',
                  desc: 'Turn research and knowledge into documents and intellectual work.',
                },
                {
                  num: '6',
                  title: 'Continue',
                  desc: 'Return to projects and continue where you left off.',
                },
              ].map((step) => (
                <div key={step.num} className="flex gap-6 items-start">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] flex items-center justify-center font-bold text-lg">
                    {step.num}
                  </div>
                  <div className="pt-1">
                    <h3 className="font-semibold text-lg mb-1">{step.title}</h3>
                    <p className="text-[color:var(--text-secondary)]">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Who It's For Section */}
        <section className="py-16 md:py-20 px-5 border-t border-[color:var(--border-subtle)]">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Who is Scholar Core for?</h2>
            <p className="text-base text-[color:var(--text-secondary)] mb-8 leading-relaxed">
              Scholar Core is built for anyone doing serious research and knowledge work.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              {[
                'PhD researchers',
                'University students',
                'Teachers and academics',
                'Independent researchers',
                'Policy researchers',
                'Writers and authors',
              ].map((audience, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[color:var(--surface-raised)]">
                  <span className="text-[color:var(--accent)]">✓</span>
                  <span>{audience}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-20 px-5 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to transform your research?</h2>
            <p className="text-base text-[color:var(--text-secondary)] mb-8">
              Start for free. No credit card required. No AI API keys to configure — Scholar Core works out of the box.
            </p>
            <button
              onClick={onGetStarted}
              className="px-6 py-3 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] font-medium rounded-[var(--radius-md)] hover:bg-[color:var(--accent-hover)] transition-colors"
            >
              Create Your Free Account
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[color:var(--border-subtle)] py-8 px-5">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ScholarCoreLogo size="sm" className="text-[color:var(--text-muted)]" />
                <span className="text-xs text-[color:var(--text-muted)]">
                  © 2026 Scholar Core. All rights reserved.
                </span>
              </div>
              <div className="flex items-center gap-6 text-xs text-[color:var(--text-muted)]">
                <a href="#" className="hover:text-[color:var(--text-secondary)] transition-colors">
                  Privacy
                </a>
                <a href="#" className="hover:text-[color:var(--text-secondary)] transition-colors">
                  Terms
                </a>
                <a href="#" className="hover:text-[color:var(--text-secondary)] transition-colors">
                  Contact
                </a>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
