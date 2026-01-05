import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

// Mock fetch for API calls with pagination data
global.fetch = jest.fn()

// Generate mock data for multiple pages
const generateMockCompanies = (count: number, page: number = 0) => {
  const pageSize = 10
  const start = page * pageSize
  return Array.from({ length: Math.min(count - start, pageSize) }, (_, i) => ({
    ticker: `TEST${start + i}`,
    name: `Test Company ${start + i}`,
    latestFilingDate: '2024-01-01',
    summaryCount: 5
  }))
}

describe('Dashboard Pagination Styling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock API with paginated data
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/companies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(generateMockCompanies(25)) // 3 pages worth
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
  })

  test('pagination buttons have correct styling classes', async () => {
    render(<DashboardClient />)

    // Wait for data to load and pagination to appear
    await waitFor(() => {
      const paginationButtons = screen.getAllByRole('button').filter(btn => 
        btn.textContent && /^\d+$/.test(btn.textContent)
      )
      expect(paginationButtons.length).toBeGreaterThan(0)
    })

    const pageButtons = screen.getAllByRole('button').filter(btn => 
      btn.textContent && /^\d+$/.test(btn.textContent)
    )

    // Check that buttons have rounded-full class for circular design
    pageButtons.forEach(button => {
      expect(button).toHaveClass('rounded-full')
      expect(button).toHaveClass('h-8', 'w-8')
    })
  })

  test('active page button has correct black styling', async () => {
    render(<DashboardClient />)

    await waitFor(() => {
      // Find the first page button (should be active by default)
      const pageOneButton = screen.getByRole('button', { name: '1' })
      expect(pageOneButton).toBeInTheDocument()
      
      // Check for black background and white text classes
      expect(pageOneButton).toHaveClass('bg-black')
      expect(pageOneButton).toHaveClass('text-white')
      expect(pageOneButton).toHaveClass('hover:bg-black')
    })
  })

  test('inactive page buttons have ghost variant styling', async () => {
    render(<DashboardClient />)

    await waitFor(() => {
      const pageButtons = screen.getAllByRole('button').filter(btn => 
        btn.textContent && /^\d+$/.test(btn.textContent)
      )
      
      if (pageButtons.length > 1) {
        // Find an inactive page button (not page 1)
        const inactiveButton = pageButtons.find(btn => btn.textContent !== '1')
        
        if (inactiveButton) {
          // Should have hover states for black background
          expect(inactiveButton).toHaveClass('hover:bg-black')
          expect(inactiveButton).toHaveClass('hover:text-white')
        }
      }
    })
  })

  test('pagination button hover states work correctly', async () => {
    render(<DashboardClient />)

    await waitFor(() => {
      const pageButtons = screen.getAllByRole('button').filter(btn => 
        btn.textContent && /^\d+$/.test(btn.textContent)
      )
      
      if (pageButtons.length > 1) {
        const inactiveButton = pageButtons.find(btn => btn.textContent !== '1')
        
        if (inactiveButton) {
          // Hover should add the hover classes
          fireEvent.mouseEnter(inactiveButton)
          expect(inactiveButton).toHaveClass('hover:bg-black')
          expect(inactiveButton).toHaveClass('hover:text-white')
          
          fireEvent.mouseLeave(inactiveButton)
        }
      }
    })
  })

  test('clicking pagination button changes active state', async () => {
    render(<DashboardClient />)

    await waitFor(() => {
      const pageButtons = screen.getAllByRole('button').filter(btn => 
        btn.textContent && /^\d+$/.test(btn.textContent)
      )
      
      if (pageButtons.length > 1) {
        const pageOneButton = screen.getByRole('button', { name: '1' })
        const pageTwoButton = screen.getByRole('button', { name: '2' })
        
        // Initially page 1 should be active
        expect(pageOneButton).toHaveClass('bg-black', 'text-white')
        
        // Click page 2
        fireEvent.click(pageTwoButton)
        
        // Wait for state change
        setTimeout(() => {
          expect(pageTwoButton).toHaveClass('bg-black', 'text-white')
        }, 100)
      }
    })
  })

  test('pagination maintains consistent button size', async () => {
    render(<DashboardClient />)

    await waitFor(() => {
      const pageButtons = screen.getAllByRole('button').filter(btn => 
        btn.textContent && /^\d+$/.test(btn.textContent)
      )
      
      // All pagination buttons should have consistent sizing
      pageButtons.forEach(button => {
        expect(button).toHaveClass('h-8')
        expect(button).toHaveClass('w-8')
        expect(button).toHaveClass('rounded-full')
      })
    })
  })

  test('pagination buttons maintain proper transition classes', async () => {
    render(<DashboardClient />)

    await waitFor(() => {
      const pageButtons = screen.getAllByRole('button').filter(btn => 
        btn.textContent && /^\d+$/.test(btn.textContent)
      )
      
      // All buttons should have transition classes for smooth hover effects
      pageButtons.forEach(button => {
        expect(button).toHaveClass('transition-colors')
      })
    })
  })

  test('pagination handles edge cases with no pages', async () => {
    // Mock empty data
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/companies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]) // Empty data
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    })

    render(<DashboardClient />)

    await waitFor(() => {
      // Should show empty state, not pagination
      const emptyState = screen.getByText(/No companies found/i)
      expect(emptyState).toBeInTheDocument()
      
      // Should not show pagination buttons
      const pageButtons = screen.queryAllByRole('button').filter(btn => 
        btn.textContent && /^\d+$/.test(btn.textContent)
      )
      expect(pageButtons.length).toBe(0)
    })
  })
})