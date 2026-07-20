/**
 * JSON Validator
 * 
 * Validates and repairs JSON responses from AI providers.
 */

export interface ValidationResult<T = unknown> {
  valid: boolean;
  data?: T;
  error?: string;
  repaired?: boolean;
  confidence?: number;
}

export class JSONValidator {
  private static instance: JSONValidator;

  private constructor() {}

  static getInstance(): JSONValidator {
    if (!JSONValidator.instance) {
      JSONValidator.instance = new JSONValidator();
    }
    return JSONValidator.instance;
  }

  /**
   * Validate JSON against expected structure
   */
  validate<T>(text: string, schema?: Record<string, any>): ValidationResult<T> {
    // Clean the text
    const cleaned = this._cleanJSONString(text);
    
    try {
      const data = JSON.parse(cleaned) as T;
      
      if (schema) {
        // Basic schema validation
        const valid = this._validateAgainstSchema(data, schema);
        return {
          valid,
          data: valid ? data : undefined,
          error: valid ? undefined : 'Schema validation failed',
          confidence: valid ? 1.0 : 0.0
        };
      }

      return {
        valid: true,
        data,
        confidence: 1.0
      };
    } catch (error) {
      // Try to repair
      const repaired = this._attemptRepair(text);
      if (repaired) {
        try {
          const data = JSON.parse(repaired) as T;
          return {
            valid: true,
            data,
            repaired: true,
            confidence: 0.7
          };
        } catch {
          // Repair failed
        }
      }

      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid JSON',
        confidence: 0.0
      };
    }
  }

  private _cleanJSONString(text: string): string {
    let cleaned = text.trim();
    
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }

    return cleaned.trim();
  }

  private _validateAgainstSchema(data: unknown, schema: Record<string, any>): boolean {
    if (!schema || typeof schema !== 'object') return true;
    if (typeof data !== 'object' || data === null) return false;

    const dataObj = data as Record<string, any>;
    
    for (const key of Object.keys(schema)) {
      if (!(key in dataObj)) {
        return false;
      }
      
      // Type check
      if (schema[key]?.type && typeof dataObj[key] !== schema[key].type) {
        return false;
      }
    }

    return true;
  }

  private _attemptRepair(text: string): string | null {
    // Try to extract JSON object/array from the text
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      // Try to close unclosed brackets/braces
      let repaired = jsonMatch[0];
      
      // Count open/closed brackets
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;
      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/\]/g) || []).length;
      
      // Add missing closers
      repaired += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
      repaired += '}'.repeat(Math.max(0, openBraces - closeBraces));
      
      return repaired;
    }

    return null;
  }

  /**
   * Extract JSON from text (for mixed responses)
   */
  extract(text: string): { json: string | null; cleaned: string } {
    const cleaned = this._cleanJSONString(text);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    
    return {
      json: jsonMatch ? jsonMatch[0] : null,
      cleaned
    };
  }
}