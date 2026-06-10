export default function Stack({ size = 'md', className = '', children }) {
  return (
    <div className={`ui-stack ui-stack--${size} ${className}`.trim()}>
      {children}
    </div>
  );
}
