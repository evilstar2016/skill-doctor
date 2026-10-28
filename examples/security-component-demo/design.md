# Invoice access design — synthetic audit case

Alice and Bob own separate invoices. The caller identity comes from a trusted session.
An invoice ID is untrusted user input. Every read must enforce ownership.
AUTH-1: A caller must not read another user's invoice.
AUTH-2: A caller must be able to read their own invoice.
Out of scope: session authentication, HTTP transport, persistence and production deployment.
