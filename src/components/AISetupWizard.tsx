import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Cloud, Server, ChevronRight, ChevronLeft, CheckCircle2, AlertTriangle, Key, Cpu, Zap, Search, Loader2, BookOpen } from 'lucide-react';
import { PaperProject, AISettings, HealthStatus, AIProviderInfo } from '../types';
import AIGateway, { AI_PROVIDERS } from '../services/aiGateway';
import { encryptData, decryptData } from '../utils/crypto';

interface AISetupWizardProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onComplete: (readiness: 'validated' | 'simulated', nextChoice: 'vault' | 'skip') => void;
  onBack?: () => void;
  passcodeHash: string;
}

export default function AISetupWizard({ project, updateProject, onComplete, onBack, passcodeHash }: AISetupWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [settings, setSettings] = useState<AISettings>(project.aiSettings || { provider: 'auto', fallbackOrder: [] });
  const [isDetecting, setIsDetecting] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [healthResults, setHealthResults] = useState<Record<string, HealthStatus>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // Check if Gemini key is set on the server via .env on mount
  useEffect(() => {
    const checkServerKey = async () => {
      try {
        const resp = await fetch("/api/health");
        if (resp.ok) {
          const data = await resp.json();
          if (data.geminiKeySet) {
            // Automatically pre-select Gemini
            setSelectedProviders(prev => Array.from(new Set([...prev, "gemini"])));
            
            // Pre-fill geminiApiKey with "defined_on_server" dummy key
            const encryptedDummy = encryptData("defined_on_server", passcodeHash);
            setSettings(prev => ({
              ...prev,
              geminiApiKey: encryptedDummy
            }));
          }
        }
      } catch (e) {
        console.error("Failed to query health endpoint for fallback key verification:", e);
      }
    };
    checkServerKey();
  }, [passcodeHash]);

  // Step 1: Detect local servers on mount
  useEffect(() => {
    const detectLocal = async () => {
      try {
        const results = await AIGateway.detectLocalServers();
        const autoSelected = [];
        if (results.ollama.status === 'online') autoSelected.push('ollama');
        if (results.custom.status === 'online') autoSelected.push('custom');
        
        if (autoSelected.length > 0) {
          setSelectedProviders(prev => Array.from(new Set([...prev, ...autoSelected])));
        }
        setHealthResults(prev => ({ ...prev, ...results }));
      } catch (e) {
        console.error("Failed to detect local servers", e);
      } finally {
        setIsDetecting(false);
      }
    };
    detectLocal();
  }, []);

  const handleProviderToggle = (id: string) => {
    setSelectedProviders(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleSettingChange = (provider: string, field: string, value: string) => {
    // We update local state, and encrypt keys before saving
    let finalValue = value;
    if (field.toLowerCase().includes('apikey')) {
      finalValue = encryptData(value, passcodeHash);
    }
    
    setSettings(prev => ({
      ...prev,
      [`${provider}${field}`]: finalValue
    }));
  };

  const testConnection = async (providerId: string) => {
    setIsTesting(true);
    try {
      const result = await AIGateway.healthCheckProvider(providerId, settings);
      setHealthResults(prev => ({ ...prev, [providerId]: result }));
      
      // If Ollama is online, fetch models
      if (providerId === 'ollama' && result.status === 'online') {
        const models = await AIGateway.getOllamaModels(settings.ollamaEndpoint);
        if (models.length > 0 && !settings.ollamaModel) {
          setSettings(prev => ({ ...prev, ollamaModel: models[0] }));
        }
      }
    } catch (e) {
      setHealthResults(prev => ({ 
        ...prev, 
        [providerId]: { provider: providerId, status: 'offline', error: 'Connection failed' } 
      }));
    } finally {
      setIsTesting(false);
    }
  };

  const runFinalValidation = async () => {
    setIsTesting(true);
    try {
      // Create a test settings object with only selected providers
      const testSettings = { ...settings, fallbackOrder: selectedProviders };
      const results = await AIGateway.healthCheckAll(testSettings);
      setHealthResults(prev => ({ ...prev, ...results }));
      
      // Determine overall readiness
      const onlineCount = selectedProviders.filter(p => results[p]?.status === 'online').length;
      
      const newSettings: AISettings = {
        ...testSettings,
        providerHealth: results,
        aiReadiness: onlineCount > 0 ? 'validated' : 'simulated'
      };
      
      updateProject({ aiSettings: newSettings });
      setSettings(newSettings);
      setStep(3);
    } catch (e) {
      console.error("Validation failed", e);
    } finally {
      setIsTesting(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold font-serif text-[#1A365D] mb-3">Initialize AI Intelligence</h2>
        <p className="text-[#6B665E] max-w-2xl mx-auto text-sm">
          The Doctoral Assistant requires an AI engine to analyze your dissertation and draft the journal article. 
          Select one or more providers below. We will automatically route requests to the best available model.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Cloud Providers */}
        <div className="space-y-4">
          <h3 className="text-lg font-serif font-bold text-[#1A365D] flex items-center gap-2">
            <Cloud className="text-[#C08A3E]" /> Cloud AI Providers
          </h3>
          <div className="grid gap-3">
            {AI_PROVIDERS.filter(p => p.type === 'cloud').map(provider => (
              <div 
                key={provider.id}
                onClick={() => handleProviderToggle(provider.id)}
                className={`relative p-4 rounded-xl border cursor-pointer transition-all duration-300 ${
                  selectedProviders.includes(provider.id) 
                    ? 'bg-[#1A365D]/5 border-[#1A365D] shadow-sm' 
                    : 'bg-[#FAF8F5] border-[#E2E8F0] hover:border-[#C08A3E]/30 hover:bg-[#FAF8F5]/50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl bg-white border border-[#E2E8F0] p-2 rounded-lg">{provider.icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-[#1A365D] text-sm">{provider.name}</h4>
                      {selectedProviders.includes(provider.id) && (
                        <CheckCircle2 className="text-[#1A365D] w-5 h-5 animate-scale-in" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{provider.description}</p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {provider.pricingTier === 'free' ? 'Free Tier' : provider.pricingTier === 'freemium' ? 'Freemium' : 'API Key Req'}
                      </span>
                      {provider.id === 'server' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                          Recommended
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Local Servers */}
        <div className="space-y-4">
          <h3 className="text-lg font-serif font-bold text-[#1A365D] flex items-center gap-2">
            <Server className="text-[#C08A3E]" /> Local AI Servers
          </h3>
          <div className="grid gap-3">
            {AI_PROVIDERS.filter(p => p.type === 'local').map(provider => {
              const isDetected = healthResults[provider.id]?.status === 'online';
              return (
                <div 
                  key={provider.id}
                  onClick={() => handleProviderToggle(provider.id)}
                  className={`relative p-4 rounded-xl border cursor-pointer transition-all duration-300 ${
                    selectedProviders.includes(provider.id) 
                      ? 'bg-[#1A365D]/5 border-[#1A365D] shadow-sm' 
                      : 'bg-[#FAF8F5] border-[#E2E8F0] hover:border-[#C08A3E]/30 hover:bg-[#FAF8F5]/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-3xl bg-white border border-[#E2E8F0] p-2 rounded-lg">{provider.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-[#1A365D] text-sm">{provider.name}</h4>
                        {selectedProviders.includes(provider.id) && (
                          <CheckCircle2 className="text-[#1A365D] w-5 h-5 animate-scale-in" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{provider.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
                          <Shield className="w-3 h-3" /> 100% Private
                        </span>
                        {isDetecting ? (
                          <span className="text-[10px] flex items-center gap-1 text-gray-400">
                            <Loader2 className="w-3 h-3 animate-spin" /> Detecting...
                          </span>
                        ) : isDetected ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 font-bold">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                            Detected
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center pt-8 border-t border-gray-150">
        <p className="text-xs text-gray-500 font-mono">
          Selected: <span className="font-bold text-[#1A365D]">{selectedProviders.length} providers</span>
        </p>
        <button
          onClick={() => setStep(2)}
          disabled={selectedProviders.length === 0}
          className="px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider font-mono text-white bg-[#1A365D] hover:bg-[#122847] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          Configure Providers <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => {
    const selected = AI_PROVIDERS.filter(p => selectedProviders.includes(p.id));
    
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold font-serif text-[#1A365D] mb-3">Configure Connections</h2>
          <p className="text-[#6B665E] max-w-2xl mx-auto text-sm">
            Provide the necessary API keys or endpoint URLs for your selected AI engines. 
            Keys are XOR-encrypted locally and never stored in plain text.
          </p>
        </div>

        <div className="grid gap-6 max-w-3xl mx-auto">
          {selected.map(provider => {
            const health = healthResults[provider.id];
            
            return (
              <div key={provider.id} className="bg-[#FAF8F5] border border-[#E2E8F0] rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{provider.icon}</span>
                    <h3 className="text-base font-serif font-bold text-[#1A365D]">{provider.name}</h3>
                  </div>
                  {health && (
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                      health.status === 'online' ? 'bg-emerald-50 text-emerald-700 border border-emerald-250' :
                      health.status === 'offline' ? 'bg-red-50 text-red-700 border border-red-200' :
                      'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {health.status === 'online' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      {health.status.toUpperCase()}
                      {health.latencyMs && <span className="ml-1 opacity-75">({health.latencyMs}ms)</span>}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {/* API Key Input for Cloud */}
                  {provider.requiresApiKey && provider.id !== 'server' && (
                    <div>
                      <label className="block text-xs font-bold font-mono text-[#6B665E] uppercase tracking-wider mb-1.5 flex items-center gap-2">
                        <Key className="w-4 h-4 text-[#C08A3E]" /> API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showKeys[provider.id] ? "text" : "password"}
                          placeholder={`Enter ${provider.name} API Key`}
                          value={
                            (settings as any)[`${provider.id}ApiKey`] 
                              ? decryptData((settings as any)[`${provider.id}ApiKey`], passcodeHash) === "defined_on_server"
                                ? "Defined on Server (.env)"
                                : decryptData((settings as any)[`${provider.id}ApiKey`], passcodeHash)
                              : ""
                          }
                          className="w-full bg-white border border-[#D1CEC7] rounded-xl py-2.5 px-4 text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/10 focus:border-[#1A365D] transition-all font-mono text-sm placeholder:text-gray-400"
                          onChange={(e) => handleSettingChange(provider.id, 'ApiKey', e.target.value)}
                        />
                        <button 
                          onClick={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-gray-400 hover:text-[#1A365D] cursor-pointer"
                        >
                          {showKeys[provider.id] ? 'HIDE' : 'SHOW'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Endpoint Input for Local */}
                  {provider.type === 'local' && (
                    <div>
                      <label className="block text-xs font-bold font-mono text-[#6B665E] uppercase tracking-wider mb-1.5 flex items-center gap-2">
                        <Server className="w-4 h-4 text-[#C08A3E]" /> Server Endpoint URL
                      </label>
                      <input
                        type="text"
                        placeholder={provider.id === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'}
                        value={(settings as any)[provider.id + 'Endpoint'] || (provider.id === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1')}
                        onChange={(e) => handleSettingChange(provider.id, 'Endpoint', e.target.value)}
                        className="w-full bg-white border border-[#D1CEC7] rounded-xl py-2.5 px-4 text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/10 focus:border-[#1A365D] transition-all font-mono text-sm placeholder:text-gray-400"
                      />
                    </div>
                  )}

                  {/* Model Selector */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold font-mono text-[#6B665E] uppercase tracking-wider mb-1.5 flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-[#C08A3E]" /> Default Model
                      </label>
                      <select
                        value={(settings as any)[provider.id + 'Model'] || provider.defaultModel}
                        onChange={(e) => handleSettingChange(provider.id, 'Model', e.target.value)}
                        className="w-full bg-white border border-[#D1CEC7] rounded-xl py-2.5 px-4 text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/10 focus:border-[#1A365D] transition-all text-sm cursor-pointer"
                      >
                        {health?.models?.length ? (
                          health.models.map((m: string) => <option key={m} value={m}>{m}</option>)
                        ) : (
                          provider.availableModels.map((m: string) => <option key={m} value={m}>{m}</option>)
                        )}
                      </select>
                    </div>
                    
                    <div className="flex items-end">
                      <button
                        onClick={() => testConnection(provider.id)}
                        disabled={isTesting}
                        className="w-full py-2.5 px-4 rounded-xl font-bold font-mono text-xs uppercase tracking-wider text-gray-700 bg-white border border-[#E2E8F0] hover:bg-neutral-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                      >
                        {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        Test Connection
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-between items-center pt-8 border-t border-[#E2E8F0] max-w-3xl mx-auto">
          <button
            onClick={() => setStep(1)}
            className="px-6 py-2.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider border border-[#E2E8F0] bg-white text-gray-600 hover:bg-neutral-50 cursor-pointer transition-all"
          >
            Back
          </button>
          <button
            onClick={runFinalValidation}
            disabled={isTesting}
            className="px-6 py-2.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider text-white bg-[#1A365D] hover:bg-[#122847] transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            {isTesting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Validating...</>
            ) : (
              <>Validate & Continue <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderStep3 = () => {
    const isReady = settings.aiReadiness === 'validated';
    
    return (
      <div className="space-y-8 animate-fade-in max-w-2xl mx-auto text-center py-4">
        <div className="relative inline-flex items-center justify-center w-20 h-20 mb-4">
          <div className={`absolute inset-0 rounded-full opacity-20 animate-ping ${isReady ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
          <div className={`relative w-full h-full rounded-full flex items-center justify-center ${isReady ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : 'bg-gradient-to-br from-amber-400 to-orange-500'}`}>
            {isReady ? <CheckCircle2 className="w-10 h-10 text-white" /> : <AlertTriangle className="w-10 h-10 text-white" />}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1A365D] mb-3">
            {isReady ? 'Systems Validated' : 'No Providers Online'}
          </h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
            {isReady 
              ? "Your AI Gateway is configured and ready. The system will intelligently route requests across your selected models to optimize cost and performance."
              : "We couldn't verify a connection to any of your selected AI providers. You can proceed, but the system will use a highly limited simulated fallback mode."}
          </p>
        </div>

        <div className="bg-[#FAF8F5] rounded-2xl p-6 border border-[#E2E8F0] text-left">
          <h4 className="text-xs font-bold font-mono text-[#6B665E] uppercase tracking-wider mb-4">Gateway Diagnostics</h4>
          <div className="space-y-3">
            {selectedProviders.map(id => {
              const pInfo = AI_PROVIDERS.find(p => p.id === id);
              const status = healthResults[id]?.status || 'offline';
              return (
                <div key={id} className="flex items-center justify-between py-2 border-b border-gray-150 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{pInfo?.icon}</span>
                    <span className="font-bold text-[#1A365D] text-sm">{pInfo?.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {status === 'online' && healthResults[id]?.latencyMs && (
                      <span className="text-xs font-mono text-gray-500">{healthResults[id].latencyMs}ms</span>
                    )}
                    <span className={`text-[10px] font-bold font-mono px-2.5 py-1 rounded-full ${
                      status === 'online' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {status.toUpperCase()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-6 space-y-3">
          <button
            onClick={() => onComplete(isReady ? 'validated' : 'simulated', 'vault')}
            className={`w-full py-3.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
              isReady 
                ? 'bg-emerald-600 hover:bg-emerald-750'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            {isReady ? 'Proceed to Knowledge Vault' : 'Proceed with Simulated AI'}
            <ChevronRight className="w-4 h-4" />
          </button>
          
          <div className="flex items-center justify-between pt-2">
            {onBack && (
              <button
                onClick={onBack}
                className="text-xs font-mono font-bold text-gray-400 hover:text-[#1A365D] transition-colors flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back to Login
              </button>
            )}
            {!isReady && (
              <button
                onClick={() => setStep(2)}
                className="text-xs font-mono font-bold text-gray-400 hover:text-[#1A365D] transition-colors cursor-pointer ml-auto"
              >
                Return to Configuration
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full text-[#1A365D] font-sans selection:bg-[#1A365D] selection:text-white">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Progress Tracker (Sub-steps for Step 2) */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3">
            {[1, 2, 3].map(num => (
              <React.Fragment key={num}>
                <div className={`flex items-center justify-center w-8 h-8 rounded-full border text-xs font-mono font-bold transition-all duration-350 ${
                  step >= num 
                    ? 'border-[#1A365D] bg-[#1A365D] text-white shadow-sm' 
                    : 'border-gray-300 text-gray-400 bg-white'
                }`}>
                  {num}
                </div>
                {num < 3 && (
                  <div className={`w-12 h-[1px] transition-all duration-350 ${
                    step > num ? 'bg-[#1A365D]' : 'bg-gray-200'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Wizard Content Card */}
        <div className="bg-white/95 border border-[#E2E8F0] rounded-3xl shadow-xl p-8 md:p-10 space-y-6">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-scale-in { animation: scaleIn 0.3s ease-out forwards; }
      `}} />
    </div>
  );
}
