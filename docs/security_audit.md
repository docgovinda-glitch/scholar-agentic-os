# Security Audit
API keys are encrypted at rest using XOR cipher. Keys are decrypted only when making requests. Proxying hides keys from client network payloads when using server proxy.