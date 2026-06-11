import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './Input.css';

export default function Input({ label, hint, type, className = '', inputRef, ...props }) {
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <label className={`ui-field ${className}`.trim()} style={{ display: 'flex', flexDirection: 'column' }}>
      {label ? <span className="ui-field__label">{label}</span> : null}
      {hint ? <span className="ui-field__hint">{hint}</span> : null}
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          ref={inputRef}
          className="ui-input"
          type={inputType}
          style={isPassword ? { paddingRight: '44px' } : undefined}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-secondary, #9ca3af)',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </label>
  );
}
