export default function Form8KEmailTemplate() {
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
                        Microsoft Corp. (MSFT) - Form 8-K Filing
                      </h2>
                      <p style={{ margin: "8px 0 20px", color: "#64748b", fontSize: "14px" }}>Filed on: 6/5/2025</p>
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
                                Microsoft Corporation
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
                                Form 8-K (Current Report)
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Event Date:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>June 3, 2025</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Filed Date:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>June 5, 2025</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Items Reported:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>
                                Item 2.01, 5.02, 7.01, 9.01
                              </p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Event Details */}
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
                        🔔 Event Details
                      </h3>

                      <div
                        style={{
                          padding: "12px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                          marginBottom: "16px",
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 8px",
                            color: "#374151",
                            fontSize: "16px",
                            fontWeight: "bold",
                          }}
                        >
                          Item 2.01 - Completion of Acquisition
                        </h4>
                        <p style={{ margin: "0", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                          Microsoft Corporation completed the acquisition of Quantum Computing Inc., a leader in quantum
                          computing software solutions, for $3.2 billion in cash. The acquisition is expected to enhance
                          Microsoft&apos;s quantum computing capabilities and accelerate the development of practical quantum
                          applications.
                        </p>
                      </div>

                      <div
                        style={{
                          padding: "12px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                          marginBottom: "16px",
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 8px",
                            color: "#374151",
                            fontSize: "16px",
                            fontWeight: "bold",
                          }}
                        >
                          Item 5.02 - Departure/Election of Directors
                        </h4>
                        <p style={{ margin: "0", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                          Dr. Sarah Chen, CEO of Quantum Computing Inc., has been appointed to Microsoft&apos;s Board of
                          Directors, effective immediately. Dr. Chen will also join Microsoft&apos;s executive leadership
                          team as Corporate Vice President of Quantum Technologies.
                        </p>
                      </div>

                      <div
                        style={{
                          padding: "12px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 8px",
                            color: "#374151",
                            fontSize: "16px",
                            fontWeight: "bold",
                          }}
                        >
                          Item 7.01 - Regulation FD Disclosure
                        </h4>
                        <p style={{ margin: "0 0 8px", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                          Microsoft announced plans to integrate Quantum Computing Inc.&apos;s software solutions into Azure
                          Quantum, creating a comprehensive quantum computing platform for enterprise customers. The
                          company expects the integration to be completed by Q4 2025.
                        </p>
                        <p style={{ margin: "0", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                          Microsoft also reaffirmed its financial guidance for fiscal year 2025, stating that the
                          acquisition is expected to be slightly dilutive to non-GAAP earnings per share in fiscal years
                          2025 and 2026.
                        </p>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Market Impact */}
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
                        📈 Market Impact
                      </h3>
                      <p style={{ margin: "0 0 12px", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                        Following the announcement, Microsoft&apos;s stock (MSFT) rose 2.3% in after-hours trading. Analysts
                        have responded positively to the acquisition, highlighting the strategic importance of quantum
                        computing for Microsoft&apos;s long-term growth.
                      </p>
                      <p style={{ margin: "0", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                        The acquisition represents Microsoft&apos;s largest investment in quantum computing to date and
                        positions the company as a leader in the emerging quantum technology market, which is projected
                        to reach $65 billion by 2030.
                      </p>
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
