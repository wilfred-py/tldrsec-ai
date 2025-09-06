export default function Form10KEmailTemplate() {
  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", fontFamily: "Arial, sans-serif", backgroundColor: "#f8fafc" }}>
      {/* Header with gradient background */}
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{
          background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)",
          color: "white",
          borderRadius: "12px 12px 0 0",
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "24px", textAlign: "center" }}>
              <h1 style={{ margin: "0", fontSize: "32px", fontWeight: "bold", letterSpacing: "-0.5px" }}>
                SEC Filing Summaries
              </h1>
              <p style={{ margin: "12px 0 0", fontSize: "18px", opacity: "0.9" }}>6/6/2025</p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Filing Information */}
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderTop: "none" }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "24px" }}>
              <table width="100%" cellPadding="0" cellSpacing="0">
                <tbody>
                  <tr>
                    <td>
                      <h2
                        style={{
                          margin: "0",
                          background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                          fontSize: "24px",
                          fontWeight: "bold",
                        }}
                      >
                        Apple Inc. (AAPL) - Form 10-K Filing
                      </h2>
                      <p style={{ margin: "8px 0 20px", color: "#64748b", fontSize: "14px" }}>Filed on: 6/4/2025</p>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Summary Box */}
              <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fafafa",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)",
                  backgroundImage: "linear-gradient(to bottom, #ffffff, #f9fafb)",
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: "20px" }}>
                      <h3
                        style={{
                          margin: "0 0 16px",
                          color: "#000000",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderBottom: "2px solid #f1f5f9",
                          paddingBottom: "8px",
                        }}
                      >
                        📋 Summary
                      </h3>

                      <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse" }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Company:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px", fontWeight: "600" }}>
                                Apple Inc.
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Form Type:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>
                                Form 10-K (Annual Report)
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Fiscal Year:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>
                                Year ended September 30, 2024
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Filed Date:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>June 4, 2025</p>
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
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fafafa",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)",
                  backgroundImage: "linear-gradient(to bottom, #ffffff, #f9fafb)",
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: "20px" }}>
                      <h3
                        style={{
                          margin: "0 0 16px",
                          color: "#000000",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderBottom: "2px solid #f1f5f9",
                          paddingBottom: "8px",
                        }}
                      >
                        💰 Financial Highlights
                      </h3>

                      <table
                        width="100%"
                        cellPadding="0"
                        cellSpacing="0"
                        style={{
                          borderCollapse: "collapse",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: "#f1f5f9" }}>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "left",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              METRIC
                            </th>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              FY 2024
                            </th>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              FY 2023
                            </th>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              % CHANGE
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              Revenue
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              $425.3B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              $394.3B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#10B981",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              +7.9%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              Net Income
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              $112.8B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              $96.9B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#10B981",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              +16.4%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              EPS (Diluted)
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              $7.28
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              $6.14
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#10B981",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              +18.6%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              Cash & Equivalents
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              $73.2B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#374151",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              $62.5B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#10B981",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              +17.1%
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Segment Performance */}
              <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fafafa",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)",
                  backgroundImage: "linear-gradient(to bottom, #ffffff, #f9fafb)",
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: "20px" }}>
                      <h3
                        style={{
                          margin: "0 0 16px",
                          color: "#000000",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderBottom: "2px solid #f1f5f9",
                          paddingBottom: "8px",
                        }}
                      >
                        📱 Segment Performance
                      </h3>

                      <table
                        width="100%"
                        cellPadding="0"
                        cellSpacing="0"
                        style={{
                          borderCollapse: "collapse",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: "#f1f5f9" }}>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "left",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              PRODUCT
                            </th>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              REVENUE
                            </th>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              % OF TOTAL
                            </th>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              YOY CHANGE
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              iPhone
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              $225.8B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              53.1%
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#10B981",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              +5.2%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              Services
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              $95.2B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              22.4%
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#10B981",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              +18.3%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              Mac
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              $42.3B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              9.9%
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#10B981",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              +3.7%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              iPad
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              $28.7B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              6.7%
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#EF4444",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              -2.1%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              Wearables, Home & Accessories
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              $33.3B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#374151",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              7.8%
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#10B981",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              +12.5%
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Key Developments */}
              <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fafafa",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)",
                  backgroundImage: "linear-gradient(to bottom, #ffffff, #f9fafb)",
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: "20px" }}>
                      <h3
                        style={{
                          margin: "0 0 12px",
                          color: "#000000",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderBottom: "2px solid #f1f5f9",
                          paddingBottom: "8px",
                        }}
                      >
                        🔍 Key Developments
                      </h3>
                      <ul
                        style={{
                          margin: "0",
                          paddingLeft: "20px",
                          color: "#374151",
                          fontSize: "14px",
                          lineHeight: "1.6",
                        }}
                      >
                        <li style={{ marginBottom: "8px" }}>
                          <strong>AI Integration:</strong> Significant investments in artificial intelligence
                          capabilities across product lines, with new AI features in iOS 18 and macOS 15.
                        </li>
                        <li style={{ marginBottom: "8px" }}>
                          <strong>Services Growth:</strong> Services revenue reached an all-time high, driven by 975
                          million paid subscriptions across the platform.
                        </li>
                        <li style={{ marginBottom: "8px" }}>
                          <strong>Supply Chain:</strong> Continued diversification of manufacturing locations, with
                          increased production in India and Vietnam.
                        </li>
                        <li style={{ marginBottom: "8px" }}>
                          <strong>Capital Return:</strong> Returned $110 billion to shareholders through dividends and
                          share repurchases.
                        </li>
                        <li>
                          <strong>Environmental Goals:</strong> On track to achieve carbon neutrality for entire
                          business by 2030, with 25 suppliers committed to 100% renewable energy.
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
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{
          backgroundColor: "white",
          borderRadius: "0 0 12px 12px",
          border: "1px solid #e2e8f0",
          borderTop: "none",
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "20px", textAlign: "center" }}>
              <a
                href="#"
                style={{
                  display: "inline-block",
                  padding: "12px 24px",
                  background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)",
                  color: "white",
                  textDecoration: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                View on SEC Website
              </a>
              <p style={{ margin: "16px 0 0", color: "#6B7280", fontSize: "12px" }}>
                © 2025 tldrSEC. All rights reserved.
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
