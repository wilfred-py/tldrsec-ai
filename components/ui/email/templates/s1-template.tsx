export default function FormS1EmailTemplate() {
  return (
    <div style={{ maxWidth: &quot;600px&quot;, margin: &quot;0 auto&quot;, fontFamily: &quot;Arial, sans-serif&quot;, backgroundColor: &quot;#f8fafc&quot; }}>
      {/* Header with gradient background */}
      <table
        width=&quot;100%&quot;
        cellPadding=&quot;0&quot;
        cellSpacing=&quot;0&quot;
        style={{
          background: &quot;linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)&quot;,
          color: &quot;white&quot;,
          borderRadius: &quot;12px 12px 0 0&quot;,
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: &quot;24px&quot;, textAlign: &quot;center&quot; }}>
              <h1 style={{ margin: &quot;0&quot;, fontSize: &quot;32px&quot;, fontWeight: &quot;bold&quot;, letterSpacing: &quot;-0.5px&quot; }}>
                SEC Filing Summaries
              </h1>
              <p style={{ margin: &quot;12px 0 0&quot;, fontSize: &quot;18px&quot;, opacity: &quot;0.9&quot; }}>6/6/2025</p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Filing Information */}
      <table
        width=&quot;100%&quot;
        cellPadding=&quot;0&quot;
        cellSpacing=&quot;0&quot;
        style={{ backgroundColor: &quot;white&quot;, border: &quot;1px solid #e2e8f0&quot;, borderTop: &quot;none&quot; }}
      >
        <tbody>
          <tr>
            <td style={{ padding: &quot;24px&quot; }}>
              <table width=&quot;100%&quot; cellPadding=&quot;0&quot; cellSpacing=&quot;0&quot;>
                <tbody>
                  <tr>
                    <td>
                      <h2
                        style={{
                          margin: &quot;0&quot;,
                          background: &quot;linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)&quot;,
                          WebkitBackgroundClip: &quot;text&quot;,
                          WebkitTextFillColor: &quot;transparent&quot;,
                          backgroundClip: &quot;text&quot;,
                          fontSize: &quot;24px&quot;,
                          fontWeight: &quot;bold&quot;,
                        }}
                      >
                        Stripe, Inc. - Form S-1 Filing
                      </h2>
                      <p style={{ margin: &quot;8px 0 20px&quot;, color: &quot;#64748b&quot;, fontSize: &quot;14px&quot; }}>Filed on: 6/3/2025</p>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Summary Box */}
              <table
                width=&quot;100%&quot;
                cellPadding=&quot;0&quot;
                cellSpacing=&quot;0&quot;
                style={{
                  backgroundColor: &quot;#fafafa&quot;,
                  border: &quot;1px solid #e2e8f0&quot;,
                  borderRadius: &quot;8px&quot;,
                  marginBottom: &quot;20px&quot;,
                  boxShadow: &quot;0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)&quot;,
                  backgroundImage: &quot;linear-gradient(to bottom, #ffffff, #f9fafb)&quot;,
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: &quot;20px&quot; }}>
                      <h3
                        style={{
                          margin: &quot;0 0 16px&quot;,
                          color: &quot;#000000&quot;,
                          fontSize: &quot;18px&quot;,
                          fontWeight: &quot;bold&quot;,
                          borderBottom: &quot;2px solid #f1f5f9&quot;,
                          paddingBottom: &quot;8px&quot;,
                        }}
                      >
                        📋 Summary
                      </h3>

                      <table width=&quot;100%&quot; cellPadding=&quot;0&quot; cellSpacing=&quot;0&quot; style={{ borderCollapse: &quot;collapse&quot; }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Company:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;600&quot; }}>
                                Stripe, Inc.
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Form Type:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>
                                Form S-1 (Registration Statement)
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Offering Type:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>Initial Public Offering</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Shares Offered:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>25,000,000 shares</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Price Range:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>$85 - $95 per share</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Ticker Symbol:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>STRP (NASDAQ)</p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Financial Highlights */}
              <table
                width=&quot;100%&quot;
                cellPadding=&quot;0&quot;
                cellSpacing=&quot;0&quot;
                style={{
                  backgroundColor: &quot;#fafafa&quot;,
                  border: &quot;1px solid #e2e8f0&quot;,
                  borderRadius: &quot;8px&quot;,
                  marginBottom: &quot;20px&quot;,
                  boxShadow: &quot;0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)&quot;,
                  backgroundImage: &quot;linear-gradient(to bottom, #ffffff, #f9fafb)&quot;,
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: &quot;20px&quot; }}>
                      <h3
                        style={{
                          margin: &quot;0 0 16px&quot;,
                          color: &quot;#000000&quot;,
                          fontSize: &quot;18px&quot;,
                          fontWeight: &quot;bold&quot;,
                          borderBottom: &quot;2px solid #f1f5f9&quot;,
                          paddingBottom: &quot;8px&quot;,
                        }}
                      >
                        💰 Financial Highlights
                      </h3>

                      <table
                        width=&quot;100%&quot;
                        cellPadding=&quot;0&quot;
                        cellSpacing=&quot;0&quot;
                        style={{
                          borderCollapse: &quot;collapse&quot;,
                          border: &quot;1px solid #e2e8f0&quot;,
                          borderRadius: &quot;6px&quot;,
                          boxShadow: &quot;0 1px 2px rgba(0,0,0,0.05)&quot;,
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: &quot;#f1f5f9&quot; }}>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;left&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              METRIC ($ MILLIONS)
                            </th>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              2024
                            </th>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              2023
                            </th>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              GROWTH
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              Total Revenue
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              $16,540
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              $13,920
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#10B981&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              +18.8%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              Gross Profit
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              $8,270
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              $6,960
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#10B981&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              +18.8%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              Net Income (Loss)
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              $1,100
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              ($890)
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#10B981&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              Profitable
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              Total Payment Volume
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              $817,000
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              $640,000
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#10B981&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              +27.7%
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Use of Proceeds */}
              <table
                width=&quot;100%&quot;
                cellPadding=&quot;0&quot;
                cellSpacing=&quot;0&quot;
                style={{
                  backgroundColor: &quot;#fafafa&quot;,
                  border: &quot;1px solid #e2e8f0&quot;,
                  borderRadius: &quot;8px&quot;,
                  marginBottom: &quot;20px&quot;,
                  boxShadow: &quot;0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)&quot;,
                  backgroundImage: &quot;linear-gradient(to bottom, #ffffff, #f9fafb)&quot;,
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: &quot;20px&quot; }}>
                      <h3
                        style={{
                          margin: &quot;0 0 16px&quot;,
                          color: &quot;#000000&quot;,
                          fontSize: &quot;18px&quot;,
                          fontWeight: &quot;bold&quot;,
                          borderBottom: &quot;2px solid #f1f5f9&quot;,
                          paddingBottom: &quot;8px&quot;,
                        }}
                      >
                        💼 Use of Proceeds
                      </h3>

                      <table
                        width=&quot;100%&quot;
                        cellPadding=&quot;0&quot;
                        cellSpacing=&quot;0&quot;
                        style={{
                          borderCollapse: &quot;collapse&quot;,
                          border: &quot;1px solid #e2e8f0&quot;,
                          borderRadius: &quot;6px&quot;,
                          boxShadow: &quot;0 1px 2px rgba(0,0,0,0.05)&quot;,
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: &quot;#f1f5f9&quot; }}>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;left&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              CATEGORY
                            </th>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              ALLOCATION
                            </th>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              AMOUNT*
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              Product Development & R&D
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              40%
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              $900M
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              International Expansion
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              25%
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              $563M
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              Strategic Acquisitions
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              20%
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              $450M
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              General Corporate Purposes
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              15%
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              $337M
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      <p
                        style={{
                          margin: &quot;12px 0 0&quot;,
                          fontSize: &quot;12px&quot;,
                          color: &quot;#6B7280&quot;,
                          fontStyle: &quot;italic&quot;,
                        }}
                      >
                        * Based on midpoint pricing of $90 per share
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Risk Factors */}
              <table
                width=&quot;100%&quot;
                cellPadding=&quot;0&quot;
                cellSpacing=&quot;0&quot;
                style={{
                  backgroundColor: &quot;#fafafa&quot;,
                  border: &quot;1px solid #e2e8f0&quot;,
                  borderRadius: &quot;8px&quot;,
                  boxShadow: &quot;0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)&quot;,
                  backgroundImage: &quot;linear-gradient(to bottom, #ffffff, #f9fafb)&quot;,
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: &quot;20px&quot; }}>
                      <h3
                        style={{
                          margin: &quot;0 0 12px&quot;,
                          color: &quot;#000000&quot;,
                          fontSize: &quot;18px&quot;,
                          fontWeight: &quot;bold&quot;,
                          borderBottom: &quot;2px solid #f1f5f9&quot;,
                          paddingBottom: &quot;8px&quot;,
                        }}
                      >
                        ⚠️ Key Risk Factors
                      </h3>
                      <ul
                        style={{
                          margin: &quot;0&quot;,
                          paddingLeft: &quot;20px&quot;,
                          color: &quot;#374151&quot;,
                          fontSize: &quot;14px&quot;,
                          lineHeight: &quot;1.6&quot;,
                        }}
                      >
                        <li style={{ marginBottom: &quot;8px&quot; }}>
                          <strong>Regulatory Risk:</strong> Increasing regulatory scrutiny of payment processors and
                          fintech companies globally.
                        </li>
                        <li style={{ marginBottom: &quot;8px&quot; }}>
                          <strong>Competition:</strong> Intense competition from established players like PayPal,
                          Square, and traditional financial institutions.
                        </li>
                        <li style={{ marginBottom: &quot;8px&quot; }}>
                          <strong>Economic Sensitivity:</strong> Payment volumes may decline during economic downturns
                          affecting merchant activity.
                        </li>
                        <li style={{ marginBottom: &quot;8px&quot; }}>
                          <strong>Technology Risk:</strong> Dependence on complex technology infrastructure and
                          cybersecurity threats.
                        </li>
                        <li>
                          <strong>International Exposure:</strong> Currency fluctuations and varying regulatory
                          environments in international markets.
                        </li>
                      </ul>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <table
        width=&quot;100%&quot;
        cellPadding=&quot;0&quot;
        cellSpacing=&quot;0&quot;
        style={{
          backgroundColor: &quot;white&quot;,
          borderRadius: &quot;0 0 12px 12px&quot;,
          border: &quot;1px solid #e2e8f0&quot;,
          borderTop: &quot;none&quot;,
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: &quot;20px&quot;, textAlign: &quot;center&quot; }}>
              <a
                href=&quot;#&quot;
                style={{
                  display: &quot;inline-block&quot;,
                  padding: &quot;12px 24px&quot;,
                  background: &quot;linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)&quot;,
                  color: &quot;white&quot;,
                  textDecoration: &quot;none&quot;,
                  borderRadius: &quot;8px&quot;,
                  fontSize: &quot;14px&quot;,
                  fontWeight: &quot;bold&quot;,
                }}
              >
                View on SEC Website
              </a>
              <p style={{ margin: &quot;16px 0 0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;12px&quot; }}>
                © 2025 tldrSEC. All rights reserved.
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
