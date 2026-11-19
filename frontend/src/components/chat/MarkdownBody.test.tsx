import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownBody } from './MarkdownBody'

describe('MarkdownBody', () => {
  it('renders bold, italic, inline code, links and mentions safely', () => {
    render(
      <MarkdownBody text="**STEMI** protocol: see `troponin` for @Dr. Priya Raman and @everyone at https://pubmed.ncbi.nlm.nih.gov/12345" />,
    )
    expect(screen.getByText('STEMI').tagName).toBe('STRONG')
    expect(screen.getByText('troponin').tagName).toBe('CODE')
    expect(screen.getByText('@Dr. Priya Raman').className).toContain('mc-mention')
    expect(screen.getByText('@everyone').className).toContain('is-everyone')
    const link = screen.getByRole('link', { name: 'https://pubmed.ncbi.nlm.nih.gov/12345' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders GFM tables and blockquotes for clinical values', () => {
    const md = [
      '> Hold metformin 48h post-contrast.',
      '',
      '| Lab | Value |',
      '| --- | --- |',
      '| K+ | 3.1 mEq/L |',
    ].join('\n')
    const { container } = render(<MarkdownBody text={md} />)
    expect(container.querySelector('blockquote')).toHaveTextContent('Hold metformin 48h post-contrast.')
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('3.1 mEq/L')).toBeInTheDocument()
  })

  it('never executes raw HTML or script tags', () => {
    const { container } = render(<MarkdownBody text="<script>alert(1)</script> **safe**" />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
    expect(screen.getByText('safe').tagName).toBe('STRONG')
  })
})
