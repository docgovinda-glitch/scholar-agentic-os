/**
 * Installation Assistant
 * 
 * Provides guided installation workflow for local AI runtimes.
 */

import type { HardwareProfile, RuntimeInfo, ModelRecommendation } from '../types';

export interface InstallationStep {
  step: number;
  title: string;
  description: string;
  completed: boolean;
}

export interface InstallationGuide {
  os: string;
  runtime: string;
  steps: InstallationStep[];
  commands: string[];
  estimatedTimeMinutes: number;
  requirements: string[];
}

export class InstallationAssistant {
  private static instance: InstallationAssistant;

  private constructor() {}

  static getInstance(): InstallationAssistant {
    if (!InstallationAssistant.instance) {
      InstallationAssistant.instance = new InstallationAssistant();
    }
    return InstallationAssistant.instance;
  }

  /**
   * Generate installation guide for a runtime
   */
  generateGuide(runtime: string, os: string): InstallationGuide {
    const guides: Record<string, InstallationGuide> = {
      ollama: this._getOllamaGuide(os),
      lmstudio: this._getLMStudioGuide(os),
      docker: this._getDockerGuide(os)
    };

    return guides[runtime] || this._getDefaultGuide(runtime, os);
  }

  /**
   * Generate complete installation workflow
   */
  generateWorkflow(
    hardware: HardwareProfile,
    recommendations: ModelRecommendation[]
  ): InstallationStep[] {
    const steps: InstallationStep[] = [
      {
        step: 1,
        title: 'Hardware Detection',
        description: `Detected ${hardware.os} with ${hardware.ramGb}GB RAM, ${hardware.physicalCores} cores`,
        completed: true
      },
      {
        step: 2,
        title: 'Runtime Detection',
        description: 'Checking for installed runtimes...',
        completed: false
      },
      {
        step: 3,
        title: 'Runtime Recommendation',
        description: this._getRuntimeRecommendation(hardware),
        completed: false
      },
      {
        step: 4,
        title: 'Model Selection',
        description: `Selected ${recommendations.length} recommended models`,
        completed: false
      },
      {
        step: 5,
        title: 'Installation Guide',
        description: 'Follow the step-by-step installation instructions',
        completed: false
      }
    ];

    return steps;
  }

  private _getOllamaGuide(os: string): InstallationGuide {
    if (os === 'darwin') {
      return {
        os,
        runtime: 'ollama',
        steps: [
          { step: 1, title: 'Download', description: 'Download Ollama from ollama.com/download/mac', completed: false },
          { step: 2, title: 'Install', description: 'Open the downloaded .dmg file and drag to Applications', completed: false },
          { step: 3, title: 'Verify', description: 'Run `ollama --version` in Terminal', completed: false },
          { step: 4, title: 'Pull Model', description: 'Run `ollama pull <model-name>`', completed: false }
        ],
        commands: [
          'brew install ollama',
          '# or download from https://ollama.com/download/mac',
          'ollama pull llama3.2:latest'
        ],
        estimatedTimeMinutes: 10,
        requirements: ['macOS 10.15 or later', 'At least 4GB RAM']
      };
    }

    if (os === 'win32') {
      return {
        os,
        runtime: 'ollama',
        steps: [
          { step: 1, title: 'Download', description: 'Download Ollama from ollama.com/download/windows', completed: false },
          { step: 2, title: 'Install', description: 'Run the installer as administrator', completed: false },
          { step: 3, title: 'Verify', description: 'Run `ollama --version` in Command Prompt', completed: false },
          { step: 4, title: 'Pull Model', description: 'Run `ollama pull <model-name>`', completed: false }
        ],
        commands: [
          '# Download from https://ollama.com/download/windows',
          'ollama pull llama3.2:latest'
        ],
        estimatedTimeMinutes: 15,
        requirements: ['Windows 10 or later', 'At least 4GB RAM']
      };
    }

    // Linux
    return {
      os,
      runtime: 'ollama',
      steps: [
        { step: 1, title: 'Install', description: 'Run the install script', completed: false },
        { step: 2, title: 'Verify', description: 'Run `ollama --version`', completed: false },
        { step: 3, title: 'Pull Model', description: 'Run `ollama pull <model-name>`', completed: false }
      ],
      commands: [
        'curl -fsSL https://ollama.com/install.sh | sh',
        'ollama pull llama3.2:latest'
      ],
      estimatedTimeMinutes: 10,
      requirements: ['Linux with systemd', 'At least 4GB RAM']
    };
  }

  private _getLMStudioGuide(os: string): InstallationGuide {
    return {
      os,
      runtime: 'lmstudio',
      steps: [
        { step: 1, title: 'Download', description: 'Download LM Studio from lmstudio.ai', completed: false },
        { step: 2, title: 'Install', description: 'Install the application', completed: false },
        { step: 3, title: 'Configure', description: 'Open LM Studio and go to Local Server', completed: false },
        { step: 4, title: 'Start Server', description: 'Start the local inference server', completed: false }
      ],
      commands: [
        '# Download from https://lmstudio.ai',
        '# Follow GUI setup to download models'
      ],
      estimatedTimeMinutes: 20,
      requirements: ['Latest OS version', 'At least 8GB RAM']
    };
  }

  private _getDockerGuide(os: string): InstallationGuide {
    return {
      os,
      runtime: 'docker',
      steps: [
        { step: 1, title: 'Install Docker', description: 'Install Docker Desktop or Engine', completed: false },
        { step: 2, title: 'Pull Image', description: 'Pull an AI model container image', completed: false },
        { step: 3, title: 'Run Container', description: 'Start the container with appropriate settings', completed: false }
      ],
      commands: [
        'docker run -d -p 11434:11434 ollama/ollama',
        'docker exec ollama ollama pull llama3.2:latest'
      ],
      estimatedTimeMinutes: 15,
      requirements: ['Docker installed', 'At least 4GB RAM', 'Sufficient disk space']
    };
  }

  private _getDefaultGuide(runtime: string, os: string): InstallationGuide {
    return {
      os,
      runtime,
      steps: [
        { step: 1, title: 'Install', description: `Install ${runtime} for your system`, completed: false }
      ],
      commands: [],
      estimatedTimeMinutes: 10,
      requirements: []
    };
  }

  private _getRuntimeRecommendation(hardware: HardwareProfile): string {
    if (hardware.appleSilicon) {
      return 'Ollama recommended for Apple Silicon (optimized Metal support)';
    }
    if (hardware.cudaAvailable) {
      return 'Ollama or Docker recommended for CUDA systems';
    }
    return 'Ollama recommended for most systems';
  }

  /**
   * Validate installation
   */
  async validateInstallation(runtime: string): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:11434/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}