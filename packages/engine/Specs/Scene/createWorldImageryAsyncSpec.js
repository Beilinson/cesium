import {
  createWorldImageryAsync,
  BingMapsStyle,
  IonImageryProvider,
  Resource,
} from "../../index.js";

import createFakeBingMapsMetadataResponse from "../createFakeBingMapsMetadataResponse.js";

describe("Core/createWorldImageryAsync", function () {
  it("resolves to IonImageryProvider instance with default parameters", async function () {
    const originalload = Resource._Implementations.load;
    spyOn(Resource._Implementations, "load").and.callFake(
      function (
        url,
        responseType,
        method,
        data,
        headers,
        deferred,
        overrideMimeType,
      ) {
        if (url.includes("REST/v1/Imagery/Metadata")) {
          deferred.resolve(
            JSON.stringify(
              createFakeBingMapsMetadataResponse(BingMapsStyle.AERIAL),
            ),
          );
          return;
        }

        return originalload(
          url,
          responseType,
          method,
          data,
          headers,
          deferred,
          overrideMimeType,
        );
      },
    );

    const provider = await createWorldImageryAsync();
    expect(provider).toBeInstanceOf(IonImageryProvider);
  });
});
