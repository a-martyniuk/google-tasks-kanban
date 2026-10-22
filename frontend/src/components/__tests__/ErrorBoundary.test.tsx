import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

// Componente mock que lanza un error para probar el ErrorBoundary
const ProblematicChild = () => {
  throw new Error('Test error');
};

describe('ErrorBoundary Component', () => {
  it('renders children if there is no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="safe-child">Contenido Seguro</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId('safe-child')).toBeInTheDocument();
  });

  it('renders fallback UI when a child throws an error', () => {
    // Suprimir el error logueado por React durante el test intencional
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblematicChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Ups, algo salió mal.')).toBeInTheDocument();
    expect(screen.getByText(/Test error/i)).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it('allows user to reload the application', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mockear window.location.reload
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true
    });

    render(
      <ErrorBoundary>
        <ProblematicChild />
      </ErrorBoundary>
    );

    const reloadButton = screen.getByRole('button', { name: /Recargar aplicación/i });
    fireEvent.click(reloadButton);

    expect(reloadMock).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
