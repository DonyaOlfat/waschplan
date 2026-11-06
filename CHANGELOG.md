# Changelog

## 0.1.0 (2026-11-06)


### Features

* **api:** add app error class and error codes ([a7e7547](https://github.com/DonyaOlfat/waschplan/commit/a7e75475a58eaa94b9ed6407298cd2bd01fb7f50)), closes [#4](https://github.com/DonyaOlfat/waschplan/issues/4)
* **api:** add central error handler and not-found route ([25bed99](https://github.com/DonyaOlfat/waschplan/commit/25bed9934c20f4ab69caccadfe082cc4bdfd7fe0)), closes [#4](https://github.com/DonyaOlfat/waschplan/issues/4)
* **api:** add express app with health endpoint ([6264004](https://github.com/DonyaOlfat/waschplan/commit/62640040f4949e74657f31d19c66a542faab6e6e)), closes [#1](https://github.com/DonyaOlfat/waschplan/issues/1)
* **api:** add zod validation middleware ([42d4b26](https://github.com/DonyaOlfat/waschplan/commit/42d4b264f3bb61cfc2d1e70a9e97b4d6bef628bc)), closes [#4](https://github.com/DonyaOlfat/waschplan/issues/4)
* **api:** map prisma errors to http errors ([9626648](https://github.com/DonyaOlfat/waschplan/commit/962664820f4ae614b2f167d8bb5df49f4b38a4a8)), closes [#4](https://github.com/DonyaOlfat/waschplan/issues/4)
* **auth:** add login and logout with session cookie ([bb8ce95](https://github.com/DonyaOlfat/waschplan/commit/bb8ce95cf040797736c75a3e43c82bd269b3c0c8)), closes [#5](https://github.com/DonyaOlfat/waschplan/issues/5)
* **auth:** add password hashing helpers ([74563e8](https://github.com/DonyaOlfat/waschplan/commit/74563e887ee38f282242822ebdf7938faef0f7b7)), closes [#5](https://github.com/DonyaOlfat/waschplan/issues/5)
* **auth:** add register endpoint ([b45d8fc](https://github.com/DonyaOlfat/waschplan/commit/b45d8fcacdeaa2ae189c2c7f470e9a72aeb78036)), closes [#5](https://github.com/DonyaOlfat/waschplan/issues/5)
* **auth:** add require-auth middleware and me endpoint ([be11ffd](https://github.com/DonyaOlfat/waschplan/commit/be11ffdde6857ece6644e2813936ff345201a72d)), closes [#5](https://github.com/DonyaOlfat/waschplan/issues/5)
* **auth:** rate limit login attempts ([606bc73](https://github.com/DonyaOlfat/waschplan/commit/606bc7343a13298e0eb5487f96076100f42d5a10)), closes [#5](https://github.com/DonyaOlfat/waschplan/issues/5)
* **db:** add initial migration ([a07c2a5](https://github.com/DonyaOlfat/waschplan/commit/a07c2a59df26ea456b2584c8a030bc3e62d07fac)), closes [#3](https://github.com/DonyaOlfat/waschplan/issues/3)
* **db:** add prisma schema for users, houses, machines and bookings ([a31cb76](https://github.com/DonyaOlfat/waschplan/commit/a31cb76b64a5b7859540cebb61fabdd2e46a7587)), closes [#3](https://github.com/DonyaOlfat/waschplan/issues/3)
* **db:** add seed script with demo house in wuppertal ([eb26c28](https://github.com/DonyaOlfat/waschplan/commit/eb26c28108a0a0340cc6780e134b86e90ad78c2f)), closes [#3](https://github.com/DonyaOlfat/waschplan/issues/3)
* **house:** add member and admin guards ([1f6adcb](https://github.com/DonyaOlfat/waschplan/commit/1f6adcb832a71f8295d0163cb90a7c24849a0b84)), closes [#6](https://github.com/DonyaOlfat/waschplan/issues/6)
* **house:** add slug and invite code generators ([b764ace](https://github.com/DonyaOlfat/waschplan/commit/b764ace69d5af0b1554197d026435292036aee61)), closes [#6](https://github.com/DonyaOlfat/waschplan/issues/6)
* **house:** create house and make creator admin ([36767b4](https://github.com/DonyaOlfat/waschplan/commit/36767b4daaaa3df3befb3cf24a2648d2f5decab5)), closes [#6](https://github.com/DonyaOlfat/waschplan/issues/6)
* **house:** get house details and leave house ([cbdce46](https://github.com/DonyaOlfat/waschplan/commit/cbdce46a9e7412afc0aa53306a7c58fdd27bbc78)), closes [#6](https://github.com/DonyaOlfat/waschplan/issues/6)
* **house:** join house with invite code ([06b1953](https://github.com/DonyaOlfat/waschplan/commit/06b195321d87481af005bf9a76d954eb97b38922)), closes [#6](https://github.com/DonyaOlfat/waschplan/issues/6)
* **slots:** add berlin time helpers ([3444475](https://github.com/DonyaOlfat/waschplan/commit/3444475dd6efab7f4275ae5b336e17978e791535)), closes [#7](https://github.com/DonyaOlfat/waschplan/issues/7)
* **slots:** generate weekly slots for opening hours ([d9a13b8](https://github.com/DonyaOlfat/waschplan/commit/d9a13b8a701943dd5f000b864c5fb4b54cbacb23)), closes [#7](https://github.com/DonyaOlfat/waschplan/issues/7)
* **slots:** validate slot starts and booking window ([ba86d09](https://github.com/DonyaOlfat/waschplan/commit/ba86d0971d90d8897d3817f3fa0cf889ef8f45f2)), closes [#7](https://github.com/DonyaOlfat/waschplan/issues/7)
