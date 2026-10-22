# SPDX-License-Identifier: AGPL-3.0-only
import socket
try:
    socket.create_connection(('1.1.1.1',443),timeout=2)
except OSError:
    print('Outbound network denied: verified')
else:
    raise AssertionError('Sandbox allowed outbound network')
