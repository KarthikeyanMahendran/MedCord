import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button, FormGroup, Input, Modal } from './index'

describe('ui kit', () => {
  it('Button shows loading state and blocks clicks', async () => {
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Save</Button>)
    const b = screen.getByRole('button', { name: 'Save' })
    expect(b).toBeDisabled()
    expect(b).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(b)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('FormGroup wires label, error and aria', () => {
    render(<FormGroup id="e" label="Email" error="Required"><Input id="e" invalid /></FormGroup>)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'e-msg')
    expect(screen.getByRole('alert')).toHaveTextContent('Required')
  })

  it('Modal closes on Escape and renders dialog role', async () => {
    const onClose = vi.fn()
    render(<Modal isOpen onClose={onClose} title="Confirm">Body</Modal>)
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('Modal renders nothing when closed', () => {
    render(<Modal isOpen={false} onClose={() => {}}>Body</Modal>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
