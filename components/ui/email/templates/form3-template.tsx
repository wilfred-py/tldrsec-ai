export default function Form3EmailTemplate() {
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
                        Palantir Technologies Inc. (PLTR) - Form 3 Filing
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
                                Reporting Person:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px", fontWeight: "600" }}>
                                Dr. Jennifer Martinez
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Position:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>
                                Chief Technology Officer
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
                                Form 3 (Initial Ownership Statement)
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Appointment Date:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>June 1, 2025</p>
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
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Initial Holdings */}
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
                        📊 Initial Beneficial Ownership
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
                              SECURITY TYPE
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
                              SHARES/UNITS
                            </th>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "center",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              OWNERSHIP
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
                              VALUE*
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
                              Common Stock
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
                              0
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "center",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              Direct
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
                              $0
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
                              Stock Options (Vesting)
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
                              250,000
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "center",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              Direct
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
                              $4.8M**
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
                              Restricted Stock Units
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
                              75,000
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "center",
                                fontSize: "14px",
                                color: "#374151",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              Direct
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
                              $1.4M
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      <p
                        style={{
                          margin: "12px 0 0",
                          fontSize: "12px",
                          color: "#6B7280",
                          fontStyle: "italic",
                        }}
                      >
                        * Based on closing price of $19.25 on June 5, 2025
                        <br />
                        ** Stock options have exercise price of $15.00, vesting over 4 years
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Appointment Details */}
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
                        👤 Appointment Details
                      </h3>

                      <div
                        style={{
                          padding: "12px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                          marginBottom: "12px",
                        }}
                      >
                        <p style={{ margin: "0 0 8px", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                          <strong>Background:</strong> Dr. Jennifer Martinez joins Palantir as Chief Technology Officer,
                          bringing over 15 years of experience in artificial intelligence and machine learning from her
                          previous role as VP of AI Research at Google.
                        </p>
                      </div>

                      <div
                        style={{
                          padding: "12px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                        }}
                      >
                        <p style={{ margin: "0", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                          <strong>Compensation Package:</strong> Dr. Martinez's initial equity grant includes 250,000
                          stock options and 75,000 RSUs, with a 4-year vesting schedule and 1-year cliff. The package
                          reflects Palantir's commitment to attracting top-tier technology talent.
                        </p>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Filing Requirements */}
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
                        ℹ️ Filing Information
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
                          <strong>Filing Requirement:</strong> Form 3 must be filed within 10 days of becoming an
                          officer, director, or 10% shareholder.
                        </li>
                        <li style={{ marginBottom: "8px" }}>
                          <strong>Purpose:</strong> Establishes baseline ownership for future Form 4 and Form 5 filings
                          tracking changes in beneficial ownership.
                        </li>
                        <li style={{ marginBottom: "8px" }}>
                          <strong>Next Steps:</strong> Dr. Martinez will be required to file Form 4 within two business
                          days of any future transactions in Palantir securities.
                        </li>
                        <li>
                          <strong>Public Disclosure:</strong> This filing provides transparency into insider ownership
                          and potential conflicts of interest for investors and regulators.
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
