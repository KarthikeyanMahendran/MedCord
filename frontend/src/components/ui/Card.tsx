import type { HTMLAttributes } from 'react'

export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`mc-card ${className}`.trim()} {...rest}>{children}</div>
}

export function CardBody({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`mc-card-body ${className}`.trim()} {...rest}>{children}</div>
}
