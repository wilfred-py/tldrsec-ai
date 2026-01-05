import { render, screen, waitFor } from '@testing-library/react'
import { DashboardClient } from '@/components/dashboard/dashboard-client'
import '@testing-library/jest-dom'

// Mock the user hook
jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: {
      id: 'test-user-id',
      emailAddresses: [{ emailAddress: 'test@example.com' }]
    }
  })
}))

// Mock fetch for API calls
global.fetch = jest.fn()

describe('Dashboard Empty State Transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('transitions from loading to empty state correctly', async () => {
    let resolvePromise: (value: any) => void
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })

    // Mock API to be pending initially
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/companies')) {
        return pendingPromise
      }
      if (url.includes('/api/filings/summary')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    })

    render(<DashboardClient />)

    // Should show loading skeleton initially
    await waitFor(() => {
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    // Resolve with empty data
    resolvePromise!({
      ok: true,
      json: () => Promise.resolve([])
    })

    // Should transition to empty state
    await waitFor(() => {
      expect(screen.getByText(/No companies found/i)).toBeInTheDocument()
      
      // Skeleton should be gone
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
      expect(skeletons.length).toBe(0)
    })
  })

  test('transitions from loading to populated state correctly', async () => {
    let resolvePromise: (value: any) => void
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })

    // Mock API to be pending initially
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/companies')) {
        return pendingPromise
      }
      if (url.includes('/api/filings/summary')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    })

    render(<DashboardClient />)

    // Should show loading skeleton initially
    await waitFor(() => {
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    // Resolve with data
    resolvePromise!({
      ok: true,
      json: () => Promise.resolve([
        {
          ticker: 'AAPL',
          name: 'Apple Inc.',
          latestFilingDate: '2024-01-01',
          summaryCount: 5
        }
      ])
    })

    // Should transition to populated state
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument()
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
      
      // Skeleton should be gone
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
      expect(skeletons.length).toBe(0)
      
      // Empty state should not be shown
      expect(screen.queryByText(/No companies found/i)).not.toBeInTheDocument()
    })
  })

  test('shows correct empty state message and call-to-action', async () => {
    // Mock empty data response
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/companies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      if (url.includes('/api/filings/summary')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    })

    render(<DashboardClient />)

    await waitFor(() => {
      // Should show empty state
      expect(screen.getByText(/No companies found/i)).toBeInTheDocument()
      
      // Should show call-to-action message
      const emptyStateText = screen.getByText(/Get started by adding a company ticker/i)
      expect(emptyStateText).toBeInTheDocument()
    })
  })

  test('empty state has proper styling and layout', async () => {
    // Mock empty data response
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/companies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    })

    render(<DashboardClient />)

    await waitFor(() => {
      // Find empty state container
      const emptyStateContainer = screen.getByText(/No companies found/i).closest('div')
      
      if (emptyStateContainer) {
        // Should have proper styling classes for centered layout
        expect(emptyStateContainer).toHaveClass('flex')
        expect(emptyStateContainer).toHaveClass('min-h-[200px]')
        expect(emptyStateContainer).toHaveClass('items-center')
        expect(emptyStateContainer).toHaveClass('justify-center')
        expect(emptyStateContainer).toHaveClass('text-center')
      }
    })
  })

  test('handles API error state correctly', async () => {
    // Mock API error
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/companies')) {
        return Promise.reject(new Error('API Error'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    })

    render(<DashboardClient />)

    // Should show loading initially
    await waitFor(() => {
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    // After error, should still show empty state gracefully
    await waitFor(() => {
      const emptyState = screen.queryByText(/No companies found/i)
      expect(emptyState).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  test('maintains proper responsive layout in empty state', async () => {
    // Mock empty data response
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/companies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    })

    render(<DashboardClient />)

    await waitFor(() => {
      // Empty state should be responsive
      const emptyStateContainer = screen.getByText(/No companies found/i).closest('div')
      
      if (emptyStateContainer) {
        // Should have responsive padding
        expect(emptyStateContainer).toHaveClass('p-4')
        expect(emptyStateContainer).toHaveClass('sm:p-8')
      }
    })
  })

  test('empty state does not interfere with other UI elements', async () => {
    // Mock empty data response
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/companies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    })

    render(<DashboardClient />)

    await waitFor(() => {
      // Empty state should be shown
      expect(screen.getByText(/No companies found/i)).toBeInTheDocument()
      
      // Header should still be visible
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      
      // Add company section should still be visible
      expect(screen.getByText('Tracked Tickers')).toBeInTheDocument()
    })
  })
})